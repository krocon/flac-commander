use super::manifest::contrast_ratio;
use super::*;
use std::io::Write;

const APP: &str = "0.1.0";

/// The smallest valid PNG header: enough for the size check (`width` × `height`).
fn png(width: u32, height: u32) -> Vec<u8> {
    let mut bytes = b"\x89PNG\r\n\x1a\n\x00\x00\x00\x0dIHDR".to_vec();
    bytes.extend(width.to_be_bytes());
    bytes.extend(height.to_be_bytes());
    bytes.extend([8, 6, 0, 0, 0]);
    bytes
}

fn manifest_json(edit: impl FnOnce(&mut serde_json::Value)) -> Vec<u8> {
    let mut json = serde_json::json!({
        "formatVersion": 1,
        "id": "org.example.test",
        "name": "Test",
        "version": "1.2.3",
        "theme": { "accent": "#ff0", "radius": 4 },
        "windows": { "player": {
            "layout": "absolute", "width": 300, "height": 200,
            "background": "bg.png",
            "components": [
                { "type": "button", "action": "player.togglePlay", "x": 10, "y": 10,
                  "width": 30, "height": 24,
                  "states": { "normal": "play.png", "pressed": "play.png" } },
                { "type": "button", "action": "app.skins", "x": 50, "y": 10,
                  "width": 30, "height": 24 },
                { "type": "text", "source": "track.title", "x": 10, "y": 50,
                  "width": 200, "height": 16, "fontSize": 12, "color": "#00ff00" },
                { "type": "seekbar", "x": 10, "y": 80, "width": 280, "height": 12 }
            ]
        } }
    });
    edit(&mut json);
    serde_json::to_vec(&json).unwrap()
}

fn package(edit: impl FnOnce(&mut serde_json::Value)) -> SkinFiles {
    SkinFiles::from([
        ("skin.json".to_owned(), manifest_json(edit)),
        ("bg.png".to_owned(), png(300, 200)),
        ("play.png".to_owned(), png(30, 24)),
    ])
}

/// The places the validation complains about.
fn problems(files: SkinFiles) -> Vec<String> {
    match Skin::from_files(files, false, APP) {
        Ok(_) => Vec::new(),
        Err(diagnostics) => diagnostics.into_iter().map(|d| d.at).collect(),
    }
}

fn problems_of(edit: impl FnOnce(&mut serde_json::Value)) -> Vec<String> {
    problems(package(edit))
}

fn component(json: &mut serde_json::Value, index: usize) -> &mut serde_json::Value {
    &mut json["windows"]["player"]["components"][index]
}

#[test]
fn a_correct_package_is_accepted() {
    let skin = Skin::from_files(package(|_| {}), false, APP).unwrap();
    assert_eq!(skin.id(), "org.example.test");
    assert_eq!(skin.info().name, "Test");
    assert!(!skin.info().built_in);
    assert!(skin.file("bg.png").is_some());
    assert!(skin.file("../bg.png").is_none());
}

#[test]
fn the_built_in_skins_are_valid() {
    let library = SkinLibrary::load(None, APP);
    let names: Vec<String> = library.list().into_iter().map(|s| s.name).collect();
    assert_eq!(names, ["Modern", "Retro"]);
    assert!(library.get(DEFAULT_SKIN).is_some());
    let retro = library.get("io.github.krocon.retro").unwrap();
    assert!(retro.built_in);
    assert_eq!(image_size(retro.file("assets/background.png").unwrap()), Some((320, 440)));
}

/// WCAG AA for normal text is 4.5 : 1. Every pair of text on ground the app combines.
#[test]
fn the_built_in_skins_meet_wcag_aa() {
    assert!((contrast_ratio("#000000", "#ffffff").unwrap() - 21.0).abs() < 0.01);
    assert!((contrast_ratio("#777777", "#777777").unwrap() - 1.0).abs() < 0.01);
    assert_eq!(contrast_ratio("#fff", "#000000"), None);

    let library = SkinLibrary::load(None, APP);
    for info in library.list() {
        let skin = library.get(&info.id).unwrap();
        let t = &skin.manifest.theme;
        let colour = |c: &Option<String>| c.clone().unwrap_or_else(|| panic!("{}: unset", info.id));
        let pairs = [
            ("foreground on background", &t.foreground, &t.background),
            ("foreground on surface", &t.foreground, &t.surface),
            ("foreground on raised surface", &t.foreground, &t.surface_raised),
            ("muted on background", &t.muted, &t.background),
            ("muted on surface", &t.muted, &t.surface),
            ("accent on background", &t.accent, &t.background),
            ("accent on surface", &t.accent, &t.surface),
            ("text on accent", &t.accent_contrast, &t.accent),
            ("danger on surface", &t.danger, &t.surface),
            ("ok on surface", &t.ok, &t.surface),
        ];
        for (what, text, ground) in pairs {
            let ratio = contrast_ratio(&colour(text), &colour(ground)).unwrap();
            assert!(ratio >= 4.5, "{}: {what} is only {ratio:.1} : 1", info.name);
        }
        // the colours a skin gives single texts, on the surface they stand on
        for component in skin.manifest.windows.player.iter().flat_map(|p| &p.components) {
            if let Some(text) = &component.color {
                let ratio = contrast_ratio(text, &colour(&t.surface)).unwrap();
                assert!(ratio >= 4.5, "{}: text {text} is only {ratio:.1} : 1", info.name);
            }
        }
    }
}

#[test]
fn every_file_of_the_built_in_skins_is_embedded() {
    fn files_of(folder: &Path, root: &Path, found: &mut Vec<String>) {
        for entry in std::fs::read_dir(folder).unwrap().map(Result::unwrap) {
            let path = entry.path();
            if path.is_dir() {
                files_of(&path, root, found);
            } else {
                found.push(path.strip_prefix(root).unwrap().to_string_lossy().replace('\\', "/"));
            }
        }
    }
    let skins = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../skins");
    for (folder, embedded) in ["modern", "retro"].iter().zip(BUILT_IN) {
        let mut on_disk = Vec::new();
        files_of(&skins.join(folder), &skins.join(folder), &mut on_disk);
        on_disk.sort();
        let mut listed: Vec<String> = embedded.iter().map(|(p, _)| (*p).to_owned()).collect();
        listed.sort();
        assert_eq!(listed, on_disk, "skins/{folder} and BUILT_IN differ");
    }
}

#[test]
fn a_package_without_a_readable_manifest_is_refused() {
    assert_eq!(problems(SkinFiles::new()), ["skin.json"]);
    let broken = SkinFiles::from([("skin.json".to_owned(), b"{ not json".to_vec())]);
    assert_eq!(problems(broken), ["skin.json"]);
    // an unknown key is a mistake, not an extension
    assert_eq!(problems_of(|j| j["script"] = "alert(1)".into()), ["skin.json"]);
    assert_eq!(problems_of(|j| j["theme"]["customCss"] = "body{}".into()), ["skin.json"]);
}

#[test]
fn identity_fields_are_checked() {
    assert_eq!(problems_of(|j| j["formatVersion"] = 2.into()), ["formatVersion"]);
    for id in ["", "ab", "Upper.Case", "has space", "../escape", "a..b", "ends.", "9starts"] {
        assert_eq!(problems_of(|j| j["id"] = id.into()), ["id"], "{id:?}");
    }
    assert_eq!(problems_of(|j| j["name"] = "".into()), ["name"]);
    assert_eq!(problems_of(|j| j["name"] = "a\nb".into()), ["name"]);
    assert_eq!(problems_of(|j| j["description"] = "x".repeat(501).into()), ["description"]);
    for version in ["1", "1.2", "1.2.3.4", "1.2.x", "v1.2.3", ""] {
        assert_eq!(problems_of(|j| j["version"] = version.into()), ["version"], "{version:?}");
    }
}

#[test]
fn a_skin_for_a_newer_app_is_refused_with_the_reason() {
    assert!(problems_of(|j| j["minAppVersion"] = "0.1.0".into()).is_empty());
    assert!(problems_of(|j| j["minAppVersion"] = "0.0.9".into()).is_empty());
    assert_eq!(problems_of(|j| j["minAppVersion"] = "0.2.0".into()), ["minAppVersion"]);
    assert_eq!(problems_of(|j| j["minAppVersion"] = "soon".into()), ["minAppVersion"]);
    let Err(diagnostics) =
        Skin::from_files(package(|j| j["minAppVersion"] = "9.0.0".into()), false, APP)
    else {
        panic!("accepted")
    };
    assert!(diagnostics[0].message.contains("9.0.0"), "{diagnostics:?}");
}

#[test]
fn theme_values_cannot_smuggle_css() {
    for colour in ["red", "#12", "#12345", "#gggggg", "#fff; background: url(x)", "rgb(0,0,0)"] {
        assert_eq!(problems_of(|j| j["theme"]["accent"] = colour.into()), ["theme.accent"]);
    }
    for font in ["x; color: red", "url(evil)", "a{b}", "", "<style>"] {
        assert_eq!(problems_of(|j| j["theme"]["fontFamily"] = font.into()), ["theme.fontFamily"]);
    }
    assert!(
        problems_of(|j| j["theme"]["fontFamily"] = "\"Helvetica Neue\", sans-serif".into())
            .is_empty()
    );
    assert_eq!(problems_of(|j| j["theme"]["radius"] = 99.into()), ["theme.radius"]);
    assert_eq!(
        problems_of(|j| component(j, 2)["color"] = "blue".into()),
        ["windows.player.components[2].color"]
    );
}

#[test]
fn window_and_components_must_fit() {
    assert_eq!(problems_of(|j| j["windows"]["player"]["width"] = 50.into())[0], "windows.player");
    assert_eq!(
        problems_of(|j| {
            j["windows"]["player"].as_object_mut().unwrap().remove("height");
        }),
        ["windows.player"]
    );
    assert_eq!(
        problems_of(|j| component(j, 3)["width"] = 400.into()),
        ["windows.player.components[3]"]
    );
    assert_eq!(
        problems_of(|j| component(j, 3)["x"] = u32::MAX.into()),
        ["windows.player.components[3]"]
    );
    assert_eq!(
        problems_of(|j| component(j, 0)["height"] = 4.into()),
        ["windows.player.components[0]"]
    );
    assert_eq!(
        problems_of(|j| component(j, 2)["fontSize"] = 200.into()),
        ["windows.player.components[2].fontSize"]
    );
}

#[test]
fn actions_and_sources_come_from_fixed_lists() {
    assert_eq!(
        problems_of(|j| component(j, 0)["action"] = "shell.run".into()),
        // the unknown action, and with it the required play button is gone
        ["windows.player.components[0].action", "windows.player.components"]
    );
    assert_eq!(
        problems_of(|j| component(j, 2)["source"] = "document.cookie".into()),
        ["windows.player.components[2].source"]
    );
    assert_eq!(
        problems_of(|j| component(j, 3)["action"] = "player.stop".into()),
        ["windows.player.components[3].action"]
    );
    assert_eq!(problems_of(|j| component(j, 3)["type"] = "iframe".into()), ["skin.json"]);
}

#[test]
fn a_player_needs_play_and_the_way_back_to_the_skins() {
    let without = |index: usize| {
        problems_of(|j| {
            j["windows"]["player"]["components"].as_array_mut().unwrap().remove(index);
        })
    };
    assert_eq!(without(0), ["windows.player.components"]);
    assert_eq!(without(1), ["windows.player.components"]);
}

#[test]
fn a_flow_layout_takes_no_components() {
    let flow = |j: &mut serde_json::Value| {
        j["windows"]["player"]["layout"] = "flow".into();
    };
    assert_eq!(problems_of(flow), ["windows.player"]);
    assert!(
        problems_of(|j| {
            j["windows"] = serde_json::json!({ "player": { "layout": "flow" } });
        })
        .is_empty()
    );
    assert!(
        problems_of(|j| {
            j.as_object_mut().unwrap().remove("windows");
        })
        .is_empty()
    );
}

#[test]
fn picture_paths_stay_inside_the_package() {
    for path in
        ["../bg.png", "/etc/passwd", "C:\\x.png", "a/../../b.png", "a//b.png", "./bg.png", ""]
    {
        assert_eq!(
            problems_of(|j| j["windows"]["player"]["background"] = path.into()),
            ["windows.player.background"],
            "{path:?}"
        );
    }
    assert_eq!(
        problems_of(|j| component(j, 0)["states"]["hover"] = "missing.png".into()),
        ["windows.player.components[0].states.hover"]
    );
    assert!(is_safe_relative_path("assets/buttons/play.png"));
}

#[test]
fn pictures_are_recognised_by_content_and_bounded_in_size() {
    let mut files = package(|_| {});
    files.insert("bg.png".to_owned(), b"<svg onload=alert(1)>".to_vec());
    // refused where it is used and as a file of the package
    assert_eq!(problems(files), ["windows.player.background", "bg.png"]);

    let mut files = package(|_| {});
    files.insert("bg.png".to_owned(), png(5000, 10));
    assert_eq!(problems(files), ["windows.player.background"]);

    let mut files = package(|_| {});
    files.insert("readme.txt".to_owned(), b"hello".to_vec());
    assert_eq!(problems(files), ["readme.txt"]);
    let mut files = package(|_| {});
    files.insert("evil.png".to_owned(), b"#!/bin/sh\nrm -rf ~".to_vec());
    assert_eq!(problems(files), ["evil.png"]);
}

#[test]
fn image_headers_of_all_allowed_kinds_are_read() {
    assert_eq!(image_size(&png(320, 440)), Some((320, 440)));
    // JPEG: SOI, an APP0 segment, then SOF0 with height 2 and width 3
    let jpeg = [
        0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x04, 0x00, 0x00, 0xFF, 0xC0, 0x00, 0x0B, 0x08, 0x00, 0x02,
        0x00, 0x03,
    ];
    assert_eq!(image_size(&jpeg), Some((3, 2)));
    // WebP, extended format: canvas 16 × 9
    let mut webp = b"RIFF\x00\x00\x00\x00WEBPVP8X\x0a\x00\x00\x00\x00\x00\x00\x00".to_vec();
    webp.extend([15, 0, 0, 8, 0, 0]);
    assert_eq!(image_size(&webp), Some((16, 9)));
    for not_an_image in [&b""[..], b"GIF89a", b"<svg/>", b"\x89PNG\r\n\x1a\n", &[0xFF, 0xD8, 0xFF]]
    {
        assert_eq!(image_size(not_an_image), None);
    }
}

#[test]
fn every_problem_is_reported_not_only_the_first() {
    let found = problems_of(|j| {
        j["id"] = "X".into();
        j["version"] = "one".into();
        j["theme"]["accent"] = "yellow".into();
        component(j, 2)["source"] = "nothing".into();
    });
    assert_eq!(found, ["id", "version", "theme.accent", "windows.player.components[2].source"]);
}

// ----- archives -----

fn zip_of(entries: &[(&str, &[u8])]) -> Vec<u8> {
    let mut writer = zip::ZipWriter::new(Cursor::new(Vec::new()));
    let options = zip::write::SimpleFileOptions::default();
    for (name, bytes) in entries {
        writer.start_file(*name, options).unwrap();
        writer.write_all(bytes).unwrap();
    }
    writer.finish().unwrap().into_inner()
}

fn package_zip(prefix: &str) -> Vec<u8> {
    let files = package(|_| {});
    let entries: Vec<(String, &[u8])> =
        files.iter().map(|(k, v)| (format!("{prefix}{k}"), v.as_slice())).collect();
    let borrowed: Vec<(&str, &[u8])> = entries.iter().map(|(k, v)| (k.as_str(), *v)).collect();
    zip_of(&borrowed)
}

fn zip_problem(archive: &[u8]) -> String {
    read_zip(archive).unwrap_err().remove(0).at
}

#[test]
fn an_archive_is_unpacked_into_the_package_files() {
    let files = read_zip(&package_zip("")).unwrap();
    assert_eq!(files.keys().collect::<Vec<_>>(), ["bg.png", "play.png", "skin.json"]);
    assert!(Skin::from_files(files, false, APP).is_ok());
}

#[test]
fn an_archive_of_one_folder_is_looked_into() {
    let files = read_zip(&package_zip("My Skin/")).unwrap();
    assert_eq!(files.keys().collect::<Vec<_>>(), ["bg.png", "play.png", "skin.json"]);
}

#[test]
fn entry_names_that_leave_the_package_are_refused() {
    for name in ["../evil.png", "/abs.png", "a/../../b.png", "C:\\x.png", "..\\x.png"] {
        let archive = zip_of(&[("skin.json", b"{}"), (name, &png(1, 1))]);
        assert_eq!(zip_problem(&archive), name);
    }
}

#[test]
fn links_in_an_archive_are_refused() {
    let mut writer = zip::ZipWriter::new(Cursor::new(Vec::new()));
    let options = zip::write::SimpleFileOptions::default();
    writer.add_symlink("link.png", "/etc/passwd", options).unwrap();
    let archive = writer.finish().unwrap().into_inner();
    assert_eq!(zip_problem(&archive), "link.png");
}

#[test]
fn a_decompression_bomb_is_stopped_while_unpacking() {
    // 40 MB of zeros compress to a few kilobytes
    let zeros = vec![0u8; 40 * 1024 * 1024];
    let mut writer = zip::ZipWriter::new(Cursor::new(Vec::new()));
    let options = zip::write::SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated);
    writer.start_file("bomb.png", options).unwrap();
    writer.write_all(&zeros).unwrap();
    let archive = writer.finish().unwrap().into_inner();
    assert!(archive.len() < 200_000, "the test archive is not small: {}", archive.len());
    assert_eq!(zip_problem(&archive), "bomb.png");

    // many files that are each allowed but together too much
    let big = vec![0u8; MAX_FILE_BYTES];
    let mut writer = zip::ZipWriter::new(Cursor::new(Vec::new()));
    for n in 0..8 {
        writer.start_file(format!("{n}.png"), options).unwrap();
        writer.write_all(&big).unwrap();
    }
    let archive = writer.finish().unwrap().into_inner();
    assert_eq!(zip_problem(&archive), "archive");
}

#[test]
fn too_many_entries_and_non_archives_are_refused() {
    let names: Vec<String> = (0..=MAX_FILES).map(|n| format!("{n}.png")).collect();
    let entries: Vec<(&str, &[u8])> = names.iter().map(|n| (n.as_str(), &b""[..])).collect();
    assert_eq!(zip_problem(&zip_of(&entries)), "archive");
    assert_eq!(zip_problem(b"this is not a zip file"), "archive");
    assert_eq!(zip_problem(b""), "archive");
}

// ----- library -----

fn user_folder(test: &str) -> PathBuf {
    let folder =
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../target/test-tmp/skins").join(test);
    let _ = std::fs::remove_dir_all(&folder);
    std::fs::create_dir_all(&folder).unwrap();
    folder
}

#[test]
fn an_imported_skin_is_installed_listed_and_there_after_a_restart() {
    let folder = user_folder("import");
    let mut library = SkinLibrary::load(Some(folder.clone()), APP);
    let info = library.import_zip(&package_zip("")).unwrap();
    assert_eq!(info.id, "org.example.test");
    assert!(folder.join("org.example.test/skin.json").is_file());
    let names: Vec<String> = library.list().into_iter().map(|s| s.name).collect();
    assert_eq!(names, ["Modern", "Retro", "Test"]);

    let restarted = SkinLibrary::load(Some(folder), APP);
    let skin = restarted.get("org.example.test").unwrap();
    assert!(!skin.built_in);
    assert_eq!(image_size(skin.file("bg.png").unwrap()), Some((300, 200)));
}

#[test]
fn a_refused_archive_installs_nothing_and_says_why() {
    let folder = user_folder("refused");
    let mut library = SkinLibrary::load(Some(folder.clone()), APP);
    let files = package(|j| j["theme"]["accent"] = "yellow".into());
    let entries: Vec<(&str, &[u8])> =
        files.iter().map(|(k, v)| (k.as_str(), v.as_slice())).collect();
    let error = library.import_zip(&zip_of(&entries)).unwrap_err();
    assert_eq!(error.code, ErrorCode::InvalidSkin);
    assert!(error.details.unwrap().starts_with("theme.accent: "));
    assert_eq!(std::fs::read_dir(&folder).unwrap().count(), 0);
    assert_eq!(library.list().len(), 2);
}

#[test]
fn a_built_in_skin_can_neither_be_replaced_nor_removed() {
    let folder = user_folder("builtin");
    let mut library = SkinLibrary::load(Some(folder.clone()), APP);
    let files = package(|j| j["id"] = DEFAULT_SKIN.into());
    let entries: Vec<(&str, &[u8])> =
        files.iter().map(|(k, v)| (k.as_str(), v.as_slice())).collect();
    assert_eq!(library.import_zip(&zip_of(&entries)).unwrap_err().code, ErrorCode::InvalidSkin);
    assert_eq!(library.remove(DEFAULT_SKIN).unwrap_err().code, ErrorCode::InvalidSkin);
    assert!(library.get(DEFAULT_SKIN).unwrap().built_in);
}

#[test]
fn an_imported_skin_can_be_updated_and_removed() {
    let folder = user_folder("update");
    let mut library = SkinLibrary::load(Some(folder.clone()), APP);
    library.import_zip(&package_zip("")).unwrap();
    let files = package(|j| j["version"] = "2.0.0".into());
    let entries: Vec<(&str, &[u8])> =
        files.iter().map(|(k, v)| (k.as_str(), v.as_slice())).collect();
    assert_eq!(library.import_zip(&zip_of(&entries)).unwrap().version, "2.0.0");
    assert_eq!(library.list().len(), 3);

    library.remove("org.example.test").unwrap();
    assert!(library.get("org.example.test").is_none());
    assert!(!folder.join("org.example.test").exists());
    library.remove("org.example.test").unwrap();
}

#[test]
fn a_damaged_installed_skin_is_left_out_and_the_default_is_used() {
    let folder = user_folder("damaged");
    std::fs::create_dir_all(folder.join("broken")).unwrap();
    std::fs::write(folder.join("broken/skin.json"), "{ nope").unwrap();
    let library = SkinLibrary::load(Some(folder), APP);
    assert_eq!(library.list().len(), 2);
    assert_eq!(library.get_or_default(Some("org.gone.skin")).unwrap().id(), DEFAULT_SKIN);
    assert_eq!(library.get_or_default(None).unwrap().id(), DEFAULT_SKIN);
    assert_eq!(
        library.get_or_default(Some("io.github.krocon.retro")).unwrap().id(),
        "io.github.krocon.retro"
    );
}
