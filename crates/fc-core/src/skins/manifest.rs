//! `skin.json`: the manifest of a skin, and the rules it has to follow.
//!
//! A skin is data. It chooses values and arranges building blocks the app provides; it cannot
//! bring code, markup or free CSS. Everything is checked here, before a skin is ever shown.

use serde::{Deserialize, Serialize};

/// The format version this app reads.
pub const FORMAT_VERSION: u32 = 1;
pub const MANIFEST_FILE: &str = "skin.json";
/// Largest single file of a skin package and largest package (unpacked).
pub const MAX_FILE_BYTES: usize = 5 * 1024 * 1024;
pub const MAX_PACKAGE_BYTES: usize = 30 * 1024 * 1024;
pub const MAX_FILES: usize = 200;
/// Largest image a skin may bring, per side.
pub const MAX_IMAGE_SIDE: u32 = 4096;
const MAX_COMPONENTS: usize = 200;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Manifest {
    pub format_version: u32,
    pub id: String,
    pub name: String,
    pub version: String,
    #[serde(default)]
    pub author: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub min_app_version: Option<String>,
    #[serde(default)]
    pub preview: Option<String>,
    #[serde(default)]
    pub theme: Theme,
    #[serde(default)]
    pub windows: Windows,
}

/// Colours, fonts and radius. Every field maps to one CSS variable `--player-…`.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Theme {
    pub background: Option<String>,
    pub surface: Option<String>,
    pub surface_raised: Option<String>,
    pub foreground: Option<String>,
    pub muted: Option<String>,
    pub accent: Option<String>,
    pub accent_contrast: Option<String>,
    pub border: Option<String>,
    pub ok: Option<String>,
    pub danger: Option<String>,
    pub focus: Option<String>,
    pub font_family: Option<String>,
    pub font_mono: Option<String>,
    /// Corner radius in CSS pixels.
    pub radius: Option<u32>,
}

impl Theme {
    fn colours(&self) -> [(&'static str, &Option<String>); 11] {
        [
            ("background", &self.background),
            ("surface", &self.surface),
            ("surfaceRaised", &self.surface_raised),
            ("foreground", &self.foreground),
            ("muted", &self.muted),
            ("accent", &self.accent),
            ("accentContrast", &self.accent_contrast),
            ("border", &self.border),
            ("ok", &self.ok),
            ("danger", &self.danger),
            ("focus", &self.focus),
        ]
    }
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Windows {
    #[serde(default)]
    pub player: Option<PlayerWindow>,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Layout {
    /// The app lays out its standard player; the skin gives colours and fonts.
    #[default]
    Flow,
    /// The skin places every building block itself, in a window of fixed size.
    Absolute,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PlayerWindow {
    #[serde(default)]
    pub layout: Layout,
    /// Size of the window content in CSS pixels (`absolute` layout only).
    #[serde(default)]
    pub width: Option<u32>,
    #[serde(default)]
    pub height: Option<u32>,
    #[serde(default)]
    pub background: Option<String>,
    /// Scale images without smoothing (pixel art).
    #[serde(default)]
    pub pixelated: bool,
    #[serde(default)]
    pub components: Vec<Component>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ComponentType {
    Button,
    Seekbar,
    Volume,
    Text,
    Time,
    Playlist,
    Image,
    /// Bars that follow the music.
    Spectrum,
    /// A picture that turns around a pivot with the position of the track and can be dragged
    /// to seek: a tonearm, a pointer.
    Needle,
    /// A picture that turns round and round while music plays: a reel, the label of a record.
    Spinner,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Align {
    Left,
    Center,
    Right,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Component {
    #[serde(rename = "type")]
    pub kind: ComponentType,
    pub x: u32,
    pub y: u32,
    pub width: u32,
    pub height: u32,
    /// What a button does – one of [`ACTIONS`].
    #[serde(default)]
    pub action: Option<String>,
    /// What a text or time shows – one of [`TEXT_SOURCES`] / [`TIME_SOURCES`].
    #[serde(default)]
    pub source: Option<String>,
    /// Images of a button per state, or the single image of an `image`.
    #[serde(default)]
    pub states: Option<States>,
    #[serde(default)]
    pub align: Option<Align>,
    /// Font size in CSS pixels.
    #[serde(default)]
    pub font_size: Option<u32>,
    #[serde(default)]
    pub color: Option<String>,
    /// The point a `needle` turns around, in CSS pixels from the top left of its box.
    #[serde(default)]
    pub pivot_x: Option<u32>,
    #[serde(default)]
    pub pivot_y: Option<u32>,
    /// Rotation of a `needle` in degrees (clockwise) at the start and at the end of the track.
    #[serde(default)]
    pub from: Option<i32>,
    #[serde(default)]
    pub to: Option<i32>,
    /// Rotation of a `needle` while nothing is loaded; `from` if left out.
    #[serde(default)]
    pub rest: Option<i32>,
    /// Milliseconds a `spinner` takes for one turn.
    #[serde(default)]
    pub period: Option<u32>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct States {
    pub normal: Option<String>,
    pub hover: Option<String>,
    pub pressed: Option<String>,
    /// Shown while the button's function is on (playing, repeat, shuffle).
    pub active: Option<String>,
    pub disabled: Option<String>,
}

impl States {
    fn all(&self) -> [(&'static str, &Option<String>); 5] {
        [
            ("normal", &self.normal),
            ("hover", &self.hover),
            ("pressed", &self.pressed),
            ("active", &self.active),
            ("disabled", &self.disabled),
        ]
    }
}

/// Everything a skin button can do. There are no freely defined actions.
pub const ACTIONS: &[&str] = &[
    "player.togglePlay",
    "player.play",
    "player.pause",
    "player.stop",
    "player.next",
    "player.previous",
    "player.open",
    "player.repeat",
    "player.shuffle",
    "app.skins",
    "window.playlist",
    "window.equalizer",
];
pub const TEXT_SOURCES: &[&str] =
    &["track.title", "track.artist", "track.details", "player.status"];
pub const TIME_SOURCES: &[&str] = &["position", "duration"];

/// One thing that is wrong with a skin.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Diagnostic {
    /// Where: `windows.player.components[2].states.hover`, or a file name.
    pub at: String,
    pub message: String,
}

impl std::fmt::Display for Diagnostic {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}: {}", self.at, self.message)
    }
}

struct Report(Vec<Diagnostic>);

impl Report {
    fn add(&mut self, at: impl Into<String>, message: impl Into<String>) {
        self.0.push(Diagnostic { at: at.into(), message: message.into() });
    }
}

/// Checks `manifest` against the rules. `file` gives the bytes of a file of the package.
/// `app_version` is this app's version (`minAppVersion` is compared with it).
pub fn validate(
    manifest: &Manifest,
    file: &dyn Fn(&str) -> Option<Vec<u8>>,
    app_version: &str,
) -> Vec<Diagnostic> {
    let mut report = Report(Vec::new());
    let r = &mut report;

    if manifest.format_version != FORMAT_VERSION {
        r.add(
            "formatVersion",
            format!("is {}, this app reads version {FORMAT_VERSION}", manifest.format_version),
        );
    }
    if !is_valid_id(&manifest.id) {
        r.add("id", "must be 3–100 characters of a–z, 0–9, '.' and '-', starting with a letter");
    }
    check_text(r, "name", Some(&manifest.name), 1, 100);
    check_text(r, "author", manifest.author.as_ref(), 0, 100);
    check_text(r, "description", manifest.description.as_ref(), 0, 500);
    if parse_version(&manifest.version).is_none() {
        r.add("version", "must be three numbers like 1.0.0");
    }
    if let Some(min) = &manifest.min_app_version {
        match (parse_version(min), parse_version(app_version)) {
            (None, _) => r.add("minAppVersion", "must be three numbers like 1.0.0"),
            (Some(min), Some(app)) if min > app => r.add(
                "minAppVersion",
                format!(
                    "this skin needs version {} of the app, this is {app_version}",
                    min_text(min)
                ),
            ),
            _ => {}
        }
    }
    if let Some(preview) = &manifest.preview {
        check_image(r, "preview", preview, file);
    }

    for (name, colour) in manifest.theme.colours() {
        if let Some(colour) = colour
            && !is_colour(colour)
        {
            r.add(format!("theme.{name}"), "must be a colour like #rgb, #rrggbb or #rrggbbaa");
        }
    }
    for (name, font) in
        [("fontFamily", &manifest.theme.font_family), ("fontMono", &manifest.theme.font_mono)]
    {
        if let Some(font) = font
            && !is_font_list(font)
        {
            r.add(
                format!("theme.{name}"),
                "must be font names separated by commas (letters, digits, spaces, '-', quotes)",
            );
        }
    }
    if manifest.theme.radius.is_some_and(|radius| radius > 32) {
        r.add("theme.radius", "must be between 0 and 32");
    }

    if let Some(player) = &manifest.windows.player {
        check_player(r, player, file);
    }
    report.0
}

fn check_player(r: &mut Report, player: &PlayerWindow, file: &dyn Fn(&str) -> Option<Vec<u8>>) {
    let at = "windows.player";
    if player.layout == Layout::Flow {
        if !player.components.is_empty() || player.background.is_some() {
            r.add(at, "components and background need \"layout\": \"absolute\"");
        }
        return;
    }
    let (Some(width), Some(height)) = (player.width, player.height) else {
        r.add(at, "an absolute layout needs width and height");
        return;
    };
    if !(200..=2000).contains(&width) || !(100..=2000).contains(&height) {
        r.add(at, "width must be 200–2000 and height 100–2000");
    }
    if let Some(background) = &player.background {
        check_image(r, &format!("{at}.background"), background, file);
    }
    if player.components.len() > MAX_COMPONENTS {
        r.add(format!("{at}.components"), format!("more than {MAX_COMPONENTS} components"));
        return;
    }
    for (index, component) in player.components.iter().enumerate() {
        check_component(r, &format!("{at}.components[{index}]"), component, width, height, file);
    }
    // what a player cannot do without, whatever it looks like
    let has_action =
        |action: &str| player.components.iter().any(|c| c.action.as_deref() == Some(action));
    if !has_action("player.togglePlay") && !has_action("player.play") {
        r.add(
            format!("{at}.components"),
            "a button with the action player.togglePlay or player.play is required",
        );
    }
    if !has_action("app.skins") {
        r.add(
            format!("{at}.components"),
            "a button with the action app.skins is required (the way back to another skin)",
        );
    }
}

fn check_component(
    r: &mut Report,
    at: &str,
    c: &Component,
    width: u32,
    height: u32,
    file: &dyn Fn(&str) -> Option<Vec<u8>>,
) {
    let inside = c.x.checked_add(c.width).is_some_and(|right| right <= width)
        && c.y.checked_add(c.height).is_some_and(|bottom| bottom <= height);
    if c.width == 0 || c.height == 0 || !inside {
        r.add(at, "must have a size and lie inside the window");
    }
    if c.color.as_ref().is_some_and(|colour| !is_colour(colour)) {
        r.add(format!("{at}.color"), "must be a colour like #rgb, #rrggbb or #rrggbbaa");
    }
    if c.font_size.is_some_and(|size| !(6..=72).contains(&size)) {
        r.add(format!("{at}.fontSize"), "must be between 6 and 72");
    }
    let known =
        |list: &[&str], value: &Option<String>| value.as_deref().is_some_and(|v| list.contains(&v));
    match c.kind {
        ComponentType::Button => {
            if !known(ACTIONS, &c.action) {
                r.add(format!("{at}.action"), format!("must be one of: {}", ACTIONS.join(", ")));
            }
            // big enough to hit
            if c.width < 12 || c.height < 12 {
                r.add(at, "a button must be at least 12 × 12");
            }
        }
        ComponentType::Text => {
            if !known(TEXT_SOURCES, &c.source) {
                r.add(
                    format!("{at}.source"),
                    format!("must be one of: {}", TEXT_SOURCES.join(", ")),
                );
            }
        }
        ComponentType::Time => {
            if !known(TIME_SOURCES, &c.source) {
                r.add(
                    format!("{at}.source"),
                    format!("must be one of: {}", TIME_SOURCES.join(", ")),
                );
            }
        }
        ComponentType::Image => {
            if c.states.as_ref().and_then(|s| s.normal.as_ref()).is_none() {
                r.add(format!("{at}.states.normal"), "an image needs its file here");
            }
        }
        ComponentType::Needle => {
            if c.states.as_ref().and_then(|s| s.normal.as_ref()).is_none() {
                r.add(format!("{at}.states.normal"), "a needle needs its picture here");
            }
            let pivot_inside =
                c.pivot_x.is_some_and(|x| x <= c.width) && c.pivot_y.is_some_and(|y| y <= c.height);
            if !pivot_inside {
                r.add(at, "a needle needs pivotX and pivotY inside its box");
            }
            let angle = |a: Option<i32>| a.is_some_and(|a| (-360..=360).contains(&a));
            if !angle(c.from) || !angle(c.to) || c.from == c.to {
                r.add(at, "a needle needs two different angles from and to, between -360 and 360");
            }
            if c.rest.is_some() && !angle(c.rest) {
                r.add(format!("{at}.rest"), "must be between -360 and 360");
            }
        }
        ComponentType::Spinner => {
            if c.states.as_ref().and_then(|s| s.normal.as_ref()).is_none() {
                r.add(format!("{at}.states.normal"), "a spinner needs its picture here");
            }
            if !c.period.is_some_and(|ms| (500..=120_000).contains(&ms)) {
                r.add(
                    format!("{at}.period"),
                    "a spinner needs the time of one turn, 500 to 120000 ms",
                );
            }
        }
        ComponentType::Seekbar
        | ComponentType::Volume
        | ComponentType::Playlist
        | ComponentType::Spectrum => {}
    }
    if c.kind != ComponentType::Button && c.action.is_some() {
        r.add(format!("{at}.action"), "only buttons have an action");
    }
    let turning = [c.pivot_x.map(i64::from), c.pivot_y.map(i64::from)]
        .into_iter()
        .chain([c.from, c.to, c.rest].map(|a| a.map(i64::from)))
        .any(|field| field.is_some());
    if c.kind != ComponentType::Needle && turning {
        r.add(at, "only a needle has pivotX, pivotY, from, to and rest");
    }
    if c.kind != ComponentType::Spinner && c.period.is_some() {
        r.add(format!("{at}.period"), "only a spinner has a period");
    }
    if let Some(states) = &c.states {
        if !matches!(
            c.kind,
            ComponentType::Button
                | ComponentType::Image
                | ComponentType::Needle
                | ComponentType::Spinner
        ) {
            r.add(format!("{at}.states"), "only buttons, images, needles and spinners have images");
        }
        for (state, path) in states.all() {
            if let Some(path) = path {
                check_image(r, &format!("{at}.states.{state}"), path, file);
            }
        }
    }
}

/// A file of the package that must be a picture of an allowed kind and size.
fn check_image(r: &mut Report, at: &str, path: &str, file: &dyn Fn(&str) -> Option<Vec<u8>>) {
    if !is_safe_relative_path(path) {
        r.add(at, format!("\"{path}\" is not a plain relative path inside the skin"));
        return;
    }
    let Some(bytes) = file(path) else {
        r.add(at, format!("\"{path}\" is not in the skin"));
        return;
    };
    if bytes.len() > MAX_FILE_BYTES {
        r.add(at, format!("\"{path}\" is larger than {} MB", MAX_FILE_BYTES / 1024 / 1024));
        return;
    }
    match image_size(&bytes) {
        None => r.add(at, format!("\"{path}\" is not a PNG, JPEG or WebP image")),
        Some((w, h)) if w == 0 || h == 0 || w > MAX_IMAGE_SIDE || h > MAX_IMAGE_SIDE => {
            r.add(at, format!("\"{path}\" is {w} × {h}; at most {MAX_IMAGE_SIDE} per side"));
        }
        Some(_) => {}
    }
}

fn check_text(r: &mut Report, at: &str, text: Option<&String>, min: usize, max: usize) {
    let Some(text) = text else {
        return;
    };
    let length = text.chars().count();
    if length < min || length > max || text.chars().any(char::is_control) {
        r.add(at, format!("must be {min}–{max} characters without control characters"));
    }
}

pub fn is_valid_id(id: &str) -> bool {
    (3..=100).contains(&id.len())
        && id.starts_with(|c: char| c.is_ascii_lowercase())
        && id.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '.' || c == '-')
        && !id.contains("..")
        && !id.ends_with('.')
}

/// `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa` – nothing else: a colour is copied into a style.
pub fn is_colour(text: &str) -> bool {
    text.strip_prefix('#').is_some_and(|hex| {
        matches!(hex.len(), 3 | 4 | 6 | 8) && hex.chars().all(|c| c.is_ascii_hexdigit())
    })
}

/// WCAG contrast ratio (1–21) of two colours in the `#rrggbb` form; `None` for other forms.
pub fn contrast_ratio(a: &str, b: &str) -> Option<f64> {
    fn luminance(colour: &str) -> Option<f64> {
        let hex = colour.strip_prefix('#').filter(|h| h.len() == 6)?;
        let channel = |at: usize| {
            let c = f64::from(u8::from_str_radix(hex.get(at..at + 2)?, 16).ok()?) / 255.0;
            Some(if c <= 0.03928 { c / 12.92 } else { ((c + 0.055) / 1.055).powf(2.4) })
        };
        Some(0.2126 * channel(0)? + 0.7152 * channel(2)? + 0.0722 * channel(4)?)
    }
    let (la, lb) = (luminance(a)?, luminance(b)?);
    Some((la.max(lb) + 0.05) / (la.min(lb) + 0.05))
}

/// Font names as CSS takes them, without anything that could end the declaration.
fn is_font_list(text: &str) -> bool {
    !text.trim().is_empty()
        && text.len() <= 200
        && text
            .chars()
            .all(|c| c.is_alphanumeric() || matches!(c, ' ' | ',' | '-' | '\'' | '"' | '_'))
}

/// A path that stays inside the package on every system: relative, forward slashes, no `..`,
/// no drive, no empty part.
pub fn is_safe_relative_path(path: &str) -> bool {
    !path.is_empty()
        && path.len() <= 200
        && !path.starts_with('/')
        && !path.contains(['\\', ':', '\0'])
        && path
            .split('/')
            .all(|part| !part.is_empty() && part != "." && part != ".." && part.trim() == part)
}

fn parse_version(text: &str) -> Option<(u32, u32, u32)> {
    let mut parts = text.split('.').map(|p| {
        (!p.is_empty() && p.len() <= 9 && p.chars().all(|c| c.is_ascii_digit()))
            .then(|| p.parse::<u32>().ok())
            .flatten()
    });
    let version = (parts.next()??, parts.next()??, parts.next()??);
    parts.next().is_none().then_some(version)
}

fn min_text(v: (u32, u32, u32)) -> String {
    format!("{}.{}.{}", v.0, v.1, v.2)
}

/// Width and height of a PNG, JPEG or WebP, read from its header – the kind is decided by the
/// content, never by the file name. `None`: not one of these, or damaged.
pub fn image_size(bytes: &[u8]) -> Option<(u32, u32)> {
    let be32 =
        |at: usize| bytes.get(at..at + 4).map(|b| u32::from_be_bytes([b[0], b[1], b[2], b[3]]));
    let be16 =
        |at: usize| bytes.get(at..at + 2).map(|b| u32::from(u16::from_be_bytes([b[0], b[1]])));
    let le16 =
        |at: usize| bytes.get(at..at + 2).map(|b| u32::from(u16::from_le_bytes([b[0], b[1]])));
    let le24 = |at: usize| {
        bytes
            .get(at..at + 3)
            .map(|b| u32::from(b[0]) | u32::from(b[1]) << 8 | u32::from(b[2]) << 16)
    };

    if bytes.starts_with(b"\x89PNG\r\n\x1a\n") && bytes.get(12..16) == Some(b"IHDR") {
        return Some((be32(16)?, be32(20)?));
    }
    if bytes.starts_with(&[0xFF, 0xD8]) {
        // walk the segments to the first start-of-frame
        let mut at = 2;
        while bytes.get(at) == Some(&0xFF) {
            let marker = *bytes.get(at + 1)?;
            if matches!(marker, 0xC0..=0xCF) && !matches!(marker, 0xC4 | 0xC8 | 0xCC) {
                return Some((be16(at + 7)?, be16(at + 5)?));
            }
            at += 2 + be16(at + 2)? as usize;
        }
        return None;
    }
    if bytes.starts_with(b"RIFF") && bytes.get(8..12) == Some(b"WEBP") {
        return match bytes.get(12..16)? {
            b"VP8X" => Some((le24(24)? + 1, le24(27)? + 1)),
            b"VP8 " => Some((le16(26)? & 0x3FFF, le16(28)? & 0x3FFF)),
            b"VP8L" => {
                let bits = u32::from_le_bytes(bytes.get(21..25)?.try_into().ok()?);
                Some(((bits & 0x3FFF) + 1, ((bits >> 14) & 0x3FFF) + 1))
            }
            _ => None,
        };
    }
    None
}
