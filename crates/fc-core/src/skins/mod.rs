//! Skins: packages of a manifest and pictures that change how the player looks.
//!
//! A skin is validated completely before it is used ([`manifest::validate`]); a package that
//! breaks a rule is refused as a whole and the app keeps the skin it has. Built-in skins are
//! compiled into the binary, imported ones live in the app's data folder.

pub mod image;
pub mod manifest;
pub mod wsz;

use crate::error::{AppError, AppResult, ErrorCode};
use manifest::{
    Diagnostic, MANIFEST_FILE, MAX_FILE_BYTES, MAX_FILES, MAX_PACKAGE_BYTES, Manifest, image_size,
    is_safe_relative_path, validate,
};
use serde::Serialize;
use std::collections::BTreeMap;
use std::io::{Cursor, Read};
use std::path::{Path, PathBuf};
use std::sync::Arc;

/// The skin a fresh installation starts with, and the one to fall back to.
pub const DEFAULT_SKIN: &str = "io.github.krocon.modern";

/// The files of a package: path inside the package (forward slashes) → content.
pub type SkinFiles = BTreeMap<String, Vec<u8>>;

macro_rules! embedded {
    ($folder:literal: $($file:literal),+ $(,)?) => {
        &[$(($file, include_bytes!(concat!("../../../../skins/", $folder, "/", $file)) as &[u8])),+]
    };
}

/// The skins that ship with the app. `tests::every_file_of_the_built_in_skins_is_embedded`
/// keeps these lists equal to the folders under `skins/`.
const BUILT_IN: &[&[(&str, &[u8])]] = &[
    embedded!("modern": "skin.json"),
    embedded!("retro":
        "skin.json",
        "preview.png",
        "assets/background.png",
        "assets/next-pressed.png",
        "assets/next.png",
        "assets/open-pressed.png",
        "assets/open.png",
        "assets/play-active.png",
        "assets/play-pressed.png",
        "assets/play.png",
        "assets/previous-pressed.png",
        "assets/previous.png",
        "assets/repeat-active.png",
        "assets/repeat-pressed.png",
        "assets/repeat.png",
        "assets/shuffle-active.png",
        "assets/shuffle-pressed.png",
        "assets/shuffle.png",
        "assets/skins-pressed.png",
        "assets/skins.png",
        "assets/stop-pressed.png",
        "assets/stop.png",
    ),
];

/// What a list of skins shows.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkinInfo {
    pub id: String,
    pub name: String,
    pub version: String,
    pub author: Option<String>,
    pub description: Option<String>,
    /// Path of the preview picture inside the skin.
    pub preview: Option<String>,
    pub built_in: bool,
}

/// A validated skin with its files.
#[derive(Debug)]
pub struct Skin {
    pub manifest: Manifest,
    pub built_in: bool,
    files: SkinFiles,
}

impl Skin {
    /// Builds a skin from the files of a package – or says everything that is wrong with it.
    pub fn from_files(
        files: SkinFiles,
        built_in: bool,
        app_version: &str,
    ) -> Result<Self, Vec<Diagnostic>> {
        let problem = |at: &str, message: String| vec![Diagnostic { at: at.to_owned(), message }];
        let Some(json) = files.get(MANIFEST_FILE) else {
            return Err(problem(MANIFEST_FILE, "is missing at the top of the package".to_owned()));
        };
        let manifest: Manifest = serde_json::from_slice(json)
            .map_err(|e| problem(MANIFEST_FILE, format!("cannot be read: {e}")))?;

        let mut diagnostics = validate(&manifest, &|path| files.get(path).cloned(), app_version);
        // nothing but the manifest and pictures: a package is not a place to park other files
        for (path, bytes) in &files {
            if path != MANIFEST_FILE && image_size(bytes).is_none() {
                diagnostics.push(Diagnostic {
                    at: path.clone(),
                    message: "is not a PNG, JPEG or WebP image".to_owned(),
                });
            }
        }
        if diagnostics.is_empty() {
            Ok(Self { manifest, built_in, files })
        } else {
            Err(diagnostics)
        }
    }

    pub fn id(&self) -> &str {
        &self.manifest.id
    }

    /// A file of the skin. Only what the validation has seen can be served.
    pub fn file(&self, path: &str) -> Option<&[u8]> {
        self.files.get(path).map(Vec::as_slice)
    }

    pub fn info(&self) -> SkinInfo {
        let m = &self.manifest;
        SkinInfo {
            id: m.id.clone(),
            name: m.name.clone(),
            version: m.version.clone(),
            author: m.author.clone(),
            description: m.description.clone(),
            preview: m.preview.clone(),
            built_in: self.built_in,
        }
    }
}

/// The error for a package that was refused; `details` has one line per problem.
pub fn invalid_skin(diagnostics: &[Diagnostic]) -> AppError {
    let lines: Vec<String> = diagnostics.iter().map(ToString::to_string).collect();
    AppError::new(ErrorCode::InvalidSkin, "the skin was not accepted")
        .with_details(lines.join("\n"))
}

fn one(at: &str, message: impl Into<String>) -> Vec<Diagnostic> {
    vec![Diagnostic { at: at.to_owned(), message: message.into() }]
}

/// Unpacks a skin archive into memory, within the limits of the format.
///
/// Guards against the usual archive attacks: entry names that leave the package (zip slip),
/// links, too many or too large entries and archives that unpack to far more than they claim
/// (the limits count the bytes really read).
pub fn read_zip(archive: &[u8]) -> Result<SkinFiles, Vec<Diagnostic>> {
    let mut zip = zip::ZipArchive::new(Cursor::new(archive))
        .map_err(|e| one("archive", format!("is not a ZIP archive: {e}")))?;
    if zip.len() > MAX_FILES {
        return Err(one("archive", format!("has more than {MAX_FILES} entries")));
    }
    let mut files = SkinFiles::new();
    let mut total = 0usize;
    for index in 0..zip.len() {
        let mut entry = zip
            .by_index(index)
            .map_err(|e| one("archive", format!("entry {index} cannot be read: {e}")))?;
        if entry.is_dir() {
            continue;
        }
        let name = entry
            .name()
            .map_err(|e| one("archive", format!("entry {index} has an unreadable name: {e}")))?
            .into_owned();
        if entry.is_symlink() {
            return Err(one(&name, "is a link; links are not allowed in a skin"));
        }
        if !is_safe_relative_path(&name) {
            return Err(one(&name, "is not a plain relative path inside the skin"));
        }
        let mut bytes = Vec::new();
        let read = (&mut entry).take(MAX_FILE_BYTES as u64 + 1).read_to_end(&mut bytes);
        if let Err(e) = read {
            return Err(one(&name, format!("cannot be unpacked: {e}")));
        }
        if bytes.len() > MAX_FILE_BYTES {
            return Err(one(&name, format!("is larger than {} MB", MAX_FILE_BYTES / 1024 / 1024)));
        }
        total += bytes.len();
        if total > MAX_PACKAGE_BYTES {
            return Err(one(
                "archive",
                format!("unpacks to more than {} MB", MAX_PACKAGE_BYTES / 1024 / 1024),
            ));
        }
        if files.insert(name.clone(), bytes).is_some() {
            return Err(one(&name, "is in the archive twice"));
        }
    }
    Ok(strip_single_top_folder(files))
}

/// Archives made by "compress folder" have everything inside one folder: look in there.
fn strip_single_top_folder(files: SkinFiles) -> SkinFiles {
    if files.contains_key(MANIFEST_FILE) {
        return files;
    }
    let mut tops = files.keys().filter_map(|k| k.split_once('/').map(|(top, _)| top));
    let Some(top) = tops.next().map(str::to_owned) else {
        return files;
    };
    let prefix = format!("{top}/");
    if !files.keys().all(|k| k.starts_with(&prefix))
        || !files.contains_key(&format!("{prefix}{MANIFEST_FILE}"))
    {
        return files;
    }
    files.into_iter().map(|(k, v)| (k[prefix.len()..].to_owned(), v)).collect()
}

/// Reads the files of an installed skin folder, with the same limits as an archive.
fn read_folder(folder: &Path) -> Result<SkinFiles, Vec<Diagnostic>> {
    fn walk(
        root: &Path,
        folder: &Path,
        depth: usize,
        files: &mut SkinFiles,
        total: &mut usize,
    ) -> Result<(), Vec<Diagnostic>> {
        let shown = folder.display().to_string();
        let entries = std::fs::read_dir(folder).map_err(|e| one(&shown, e.to_string()))?;
        for entry in entries.filter_map(Result::ok) {
            let path = entry.path();
            let Ok(meta) = std::fs::symlink_metadata(&path) else {
                continue;
            };
            if meta.is_dir() && depth < 4 {
                walk(root, &path, depth + 1, files, total)?;
            } else if meta.is_file() {
                let Ok(relative) = path.strip_prefix(root) else {
                    continue;
                };
                let name = relative.to_string_lossy().replace('\\', "/");
                if meta.len() > MAX_FILE_BYTES as u64 || files.len() >= MAX_FILES {
                    return Err(one(&name, "is too large, or the skin has too many files"));
                }
                let bytes = std::fs::read(&path).map_err(|e| one(&name, e.to_string()))?;
                *total += bytes.len();
                if *total > MAX_PACKAGE_BYTES {
                    return Err(one(&shown, "the skin is too large"));
                }
                files.insert(name, bytes);
            }
        }
        Ok(())
    }
    let mut files = SkinFiles::new();
    walk(folder, folder, 0, &mut files, &mut 0)?;
    Ok(files)
}

/// All skins the app knows: the built-in ones and those the user imported.
pub struct SkinLibrary {
    skins: BTreeMap<String, Arc<Skin>>,
    /// Where imported skins are kept; `None`: importing is not possible.
    user_folder: Option<PathBuf>,
    app_version: String,
}

impl SkinLibrary {
    /// Loads the built-in skins and those in `user_folder`. An imported skin that is not valid
    /// (any more) is left out and logged; it never keeps the app from starting.
    pub fn load(user_folder: Option<PathBuf>, app_version: &str) -> Self {
        let mut skins = BTreeMap::new();
        for files in BUILT_IN {
            let files: SkinFiles =
                files.iter().map(|(path, bytes)| ((*path).to_owned(), bytes.to_vec())).collect();
            match Skin::from_files(files, true, app_version) {
                Ok(skin) => {
                    skins.insert(skin.id().to_owned(), Arc::new(skin));
                }
                // cannot happen in a tested build: `tests::the_built_in_skins_are_valid`
                Err(diagnostics) => log::error!("built-in skin refused: {diagnostics:?}"),
            }
        }
        if let Some(folder) = &user_folder
            && let Ok(entries) = std::fs::read_dir(folder)
        {
            for entry in entries.filter_map(Result::ok).filter(|e| e.path().is_dir()) {
                let loaded = read_folder(&entry.path())
                    .and_then(|files| Skin::from_files(files, false, app_version));
                match loaded {
                    Ok(skin) if !skins.contains_key(skin.id()) => {
                        skins.insert(skin.id().to_owned(), Arc::new(skin));
                    }
                    Ok(skin) => log::warn!("skin {} ignored: the id is taken", skin.id()),
                    Err(diagnostics) => {
                        log::warn!("skin in {} ignored: {diagnostics:?}", entry.path().display());
                    }
                }
            }
        }
        Self { skins, user_folder, app_version: app_version.to_owned() }
    }

    /// Built-in skins first, then the imported ones by name.
    pub fn list(&self) -> Vec<SkinInfo> {
        let mut list: Vec<SkinInfo> = self.skins.values().map(|s| s.info()).collect();
        list.sort_by(|a, b| b.built_in.cmp(&a.built_in).then_with(|| a.name.cmp(&b.name)));
        list
    }

    pub fn get(&self, id: &str) -> Option<Arc<Skin>> {
        self.skins.get(id).cloned()
    }

    /// The skin `id`, or the default one if it does not exist (any more).
    pub fn get_or_default(&self, id: Option<&str>) -> Option<Arc<Skin>> {
        id.and_then(|id| self.get(id)).or_else(|| self.get(DEFAULT_SKIN))
    }

    /// Validates a skin archive and installs it. An imported skin with the same id is replaced;
    /// a built-in one cannot be.
    ///
    /// A classic Winamp skin (`.wsz`) is converted first ([`wsz`]); `file_name` then names it.
    pub fn import_zip(&mut self, archive: &[u8], file_name: &str) -> AppResult<SkinInfo> {
        let mut files = read_zip(archive).map_err(|d| invalid_skin(&d))?;
        if wsz::is_classic_skin(&files) {
            files = wsz::convert(&files, file_name).map_err(|d| invalid_skin(&d))?;
            log::info!("classic skin {file_name} converted");
        }
        let skin =
            Skin::from_files(files, false, &self.app_version).map_err(|d| invalid_skin(&d))?;
        if self.skins.get(skin.id()).is_some_and(|existing| existing.built_in) {
            return Err(invalid_skin(&one("id", "is the id of a built-in skin")));
        }
        let Some(user_folder) = &self.user_folder else {
            return Err(AppError::internal("there is no folder to install skins into"));
        };
        // the id was validated: lower-case letters, digits, '.', '-' – safe as a folder name
        let target = user_folder.join(skin.id());
        let io = |e: std::io::Error| AppError::from_io(&e, &target);
        if target.exists() {
            std::fs::remove_dir_all(&target).map_err(io)?;
        }
        for (path, bytes) in &skin.files {
            let file = target.join(path);
            if let Some(parent) = file.parent() {
                std::fs::create_dir_all(parent).map_err(io)?;
            }
            std::fs::write(&file, bytes).map_err(io)?;
        }
        let info = skin.info();
        log::info!("skin {} {} installed", info.id, info.version);
        self.skins.insert(info.id.clone(), Arc::new(skin));
        Ok(info)
    }

    /// The skin `id` as an archive in our format, ready to be passed on and imported elsewhere.
    pub fn export_zip(&self, id: &str) -> AppResult<Vec<u8>> {
        use std::io::Write;
        let skin =
            self.get(id).ok_or_else(|| AppError::internal(format!("there is no skin \"{id}\"")))?;
        let failed =
            |e: String| AppError::internal("skin archive could not be written").with_details(e);
        let mut writer = zip::ZipWriter::new(Cursor::new(Vec::new()));
        let options = zip::write::SimpleFileOptions::default()
            .compression_method(zip::CompressionMethod::Deflated);
        for (path, bytes) in &skin.files {
            writer.start_file(path.as_str(), options).map_err(|e| failed(e.to_string()))?;
            writer.write_all(bytes).map_err(|e| failed(e.to_string()))?;
        }
        writer.finish().map(Cursor::into_inner).map_err(|e| failed(e.to_string()))
    }

    /// Removes an imported skin. Built-in skins stay.
    pub fn remove(&mut self, id: &str) -> AppResult<()> {
        match self.skins.get(id) {
            None => Ok(()),
            Some(skin) if skin.built_in => {
                Err(invalid_skin(&one("id", "a built-in skin cannot be removed")))
            }
            Some(_) => {
                if let Some(folder) = &self.user_folder {
                    let target = folder.join(id);
                    if target.exists() {
                        std::fs::remove_dir_all(&target)
                            .map_err(|e| AppError::from_io(&e, &target))?;
                    }
                }
                self.skins.remove(id);
                Ok(())
            }
        }
    }
}

#[cfg(test)]
mod tests;
