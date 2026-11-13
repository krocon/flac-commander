//! Import of classic Winamp 2 skins (`.wsz`): a first, deliberately limited step.
//!
//! A classic skin is a ZIP of bitmaps in which every control is a rectangle at a fixed place.
//! The importer cuts out what our format can show today – the face of the main window and its
//! buttons – and writes a normal skin package of our own format, which then goes through the
//! same validation as any other. What it leaves out is listed in `docs/WINAMP-SKINS.md`.
//!
//! No code and no artwork of Winamp or Webamp is part of this: the coordinates below describe
//! the published layout of the skin bitmaps.

use super::SkinFiles;
use super::image::Image;
use super::manifest::{Diagnostic, MANIFEST_FILE};
use serde_json::{Value, json};

/// Size of the classic main window.
const MAIN_SIZE: (u32, u32) = (275, 116);
/// Height of the strip the importer adds below it for what a classic skin has no control for.
const STRIP_HEIGHT: u32 = 24;

/// A control of the main window: where it sits, which action it gets and where its pictures
/// are in the sprite sheet (`normal`, `pressed`, and for switches `active`).
struct Control {
    name: &'static str,
    action: &'static str,
    at: (u32, u32),
    size: (u32, u32),
    normal: (u32, u32),
    pressed: (u32, u32),
    active: Option<(u32, u32)>,
}

/// `cbuttons.bmp`: the transport buttons, normal in the top row, pressed below.
const TRANSPORT: &[Control] = &[
    Control {
        name: "previous",
        action: "player.previous",
        at: (16, 88),
        size: (23, 18),
        normal: (0, 0),
        pressed: (0, 18),
        active: None,
    },
    Control {
        name: "play",
        action: "player.play",
        at: (39, 88),
        size: (23, 18),
        normal: (23, 0),
        pressed: (23, 18),
        active: None,
    },
    Control {
        name: "pause",
        action: "player.pause",
        at: (62, 88),
        size: (23, 18),
        normal: (46, 0),
        pressed: (46, 18),
        active: None,
    },
    Control {
        name: "stop",
        action: "player.stop",
        at: (85, 88),
        size: (23, 18),
        normal: (69, 0),
        pressed: (69, 18),
        active: None,
    },
    Control {
        name: "next",
        action: "player.next",
        at: (108, 88),
        size: (22, 18),
        normal: (92, 0),
        pressed: (92, 18),
        active: None,
    },
    Control {
        name: "eject",
        action: "player.open",
        at: (136, 89),
        size: (22, 16),
        normal: (114, 0),
        pressed: (114, 16),
        active: None,
    },
];

/// `shufrep.bmp`: shuffle, repeat and the buttons for the equalizer and playlist windows.
const SWITCHES: &[Control] = &[
    Control {
        name: "shuffle",
        action: "player.shuffle",
        at: (164, 89),
        size: (47, 15),
        normal: (28, 0),
        pressed: (28, 15),
        active: Some((28, 30)),
    },
    Control {
        name: "repeat",
        action: "player.repeat",
        at: (211, 89),
        size: (28, 15),
        normal: (0, 0),
        pressed: (0, 15),
        active: Some((0, 30)),
    },
    Control {
        name: "equalizer",
        action: "window.equalizer",
        at: (219, 58),
        size: (23, 12),
        normal: (0, 61),
        pressed: (46, 61),
        active: Some((0, 73)),
    },
    Control {
        name: "playlist",
        action: "window.playlist",
        at: (242, 58),
        size: (23, 12),
        normal: (23, 61),
        pressed: (69, 61),
        active: Some((23, 73)),
    },
];

/// True if the files are a classic skin: the bitmap of the main window and no manifest of ours.
pub fn is_classic_skin(files: &SkinFiles) -> bool {
    !files.contains_key(MANIFEST_FILE) && find(files, "main.bmp").is_some()
}

/// A file by its name, wherever it is in the archive and however it is capitalised.
fn find<'a>(files: &'a SkinFiles, name: &str) -> Option<&'a [u8]> {
    files
        .iter()
        .find(|(path, _)| {
            path.rsplit('/').next().is_some_and(|base| base.eq_ignore_ascii_case(name))
        })
        .map(|(_, bytes)| bytes.as_slice())
}

fn problem(at: &str, message: impl Into<String>) -> Vec<Diagnostic> {
    vec![Diagnostic { at: at.to_owned(), message: message.into() }]
}

/// Converts a classic skin into a package of our format. `file_name` (of the archive) gives
/// the skin its name and id.
pub fn convert(files: &SkinFiles, file_name: &str) -> Result<SkinFiles, Vec<Diagnostic>> {
    let main = find(files, "main.bmp").ok_or_else(|| problem("main.bmp", "is missing"))?;
    let main = Image::from_bmp(main).map_err(|e| problem("main.bmp", e))?;
    let face = main.crop(0, 0, MAIN_SIZE.0, MAIN_SIZE.1).ok_or_else(|| {
        problem(
            "main.bmp",
            format!("is {} × {}, expected at least 275 × 116", main.width, main.height),
        )
    })?;
    let colours = PlaylistColours::read(find(files, "pledit.txt"));

    let mut package = SkinFiles::new();
    let mut components: Vec<Value> = Vec::new();

    // the face of the main window, with a strip in the skin's own colours below it
    let height = MAIN_SIZE.1 + STRIP_HEIGHT;
    let mut background = Image::filled(MAIN_SIZE.0, height, colours.background);
    for y in 0..MAIN_SIZE.1 {
        for x in 0..MAIN_SIZE.0 {
            if let Some(pixel) = face.pixel(x, y) {
                background.set_pixel(x, y, pixel);
            }
        }
    }
    package.insert("assets/background.png".to_owned(), background.to_png());

    // what the display shows: title, time, the two sliders (drawn by the app in the skin's colours)
    let text = hex(colours.text);
    components.push(json!({
        "type": "text", "source": "track.title",
        "x": 111, "y": 24, "width": 154, "height": 12, "fontSize": 9, "color": text
    }));
    components.push(json!({
        "type": "time", "source": "position",
        "x": 48, "y": 26, "width": 56, "height": 13, "fontSize": 12, "color": text
    }));
    // the visualizer of the classic display, in the colour of the current playlist entry
    components.push(json!({
        "type": "spectrum", "x": 24, "y": 43, "width": 76, "height": 16,
        "color": hex(colours.current)
    }));
    components.push(json!({ "type": "seekbar", "x": 16, "y": 72, "width": 248, "height": 10 }));
    components.push(json!({ "type": "volume", "x": 107, "y": 57, "width": 68, "height": 13 }));

    let mut placed = Vec::new();
    for (sheet_name, controls) in [("cbuttons.bmp", TRANSPORT), ("shufrep.bmp", SWITCHES)] {
        // a sheet that is missing or unreadable only costs its buttons
        let Some(sheet) = find(files, sheet_name).and_then(|bytes| Image::from_bmp(bytes).ok())
        else {
            continue;
        };
        for control in controls {
            let cut = |at: (u32, u32)| sheet.crop(at.0, at.1, control.size.0, control.size.1);
            let (Some(normal), Some(pressed)) = (cut(control.normal), cut(control.pressed)) else {
                continue;
            };
            let mut states = json!({
                "normal": format!("assets/{}.png", control.name),
                "pressed": format!("assets/{}-pressed.png", control.name),
            });
            package.insert(format!("assets/{}.png", control.name), normal.to_png());
            package.insert(format!("assets/{}-pressed.png", control.name), pressed.to_png());
            if let Some(active) = control.active.and_then(cut) {
                package.insert(format!("assets/{}-active.png", control.name), active.to_png());
                states["active"] = json!(format!("assets/{}-active.png", control.name));
            }
            components.push(json!({
                "type": "button", "action": control.action,
                "x": control.at.0, "y": control.at.1,
                "width": control.size.0, "height": control.size.1,
                "states": states
            }));
            placed.push(control.action);
        }
    }

    // What the classic face has no button for – or what its sheets did not give – goes into
    // the strip as buttons the app draws: play and the way to the skins are never missing.
    let mut strip: Vec<&str> = Vec::new();
    if !placed.contains(&"player.play") {
        strip.push("player.togglePlay");
    }
    strip.push("app.skins");
    for action in ["window.playlist", "window.equalizer"] {
        if !placed.contains(&action) {
            strip.push(action);
        }
    }
    let slot = (MAIN_SIZE.0 - 8) / strip.len() as u32;
    for (index, action) in strip.iter().enumerate() {
        components.push(json!({
            "type": "button", "action": action,
            "x": 4 + index as u32 * slot, "y": MAIN_SIZE.1 + 3,
            "width": slot - 4, "height": STRIP_HEIGHT - 6
        }));
    }

    let name = skin_name(file_name);
    let manifest = json!({
        "formatVersion": 1,
        "id": format!("wsz.{}", slug(&name)),
        "name": name,
        "version": "1.0.0",
        "description": "Imported from a classic skin. Shown: the main window and its buttons.",
        "preview": "assets/background.png",
        "theme": {
            "background": hex(colours.background),
            "surface": hex(colours.background),
            "surfaceRaised": hex(colours.selected),
            "foreground": hex(colours.text),
            "muted": hex(colours.text),
            "accent": hex(colours.current),
            "accentContrast": hex(colours.background),
            "border": hex(colours.selected),
            "radius": 0
        },
        "windows": { "player": {
            "layout": "absolute", "width": MAIN_SIZE.0, "height": height,
            "background": "assets/background.png", "pixelated": true,
            "components": components
        } }
    });
    let json = serde_json::to_vec_pretty(&manifest)
        .map_err(|e| problem(MANIFEST_FILE, format!("could not be written: {e}")))?;
    package.insert(MANIFEST_FILE.to_owned(), json);
    Ok(package)
}

/// The colours of `pledit.txt` – the only place where a classic skin names colours as text.
#[derive(Debug, PartialEq, Eq)]
struct PlaylistColours {
    text: [u8; 3],
    current: [u8; 3],
    background: [u8; 3],
    selected: [u8; 3],
}

impl PlaylistColours {
    /// The classic green on black, for skins without a (readable) `pledit.txt`.
    const DEFAULT: Self = Self {
        text: [0x00, 0xFF, 0x00],
        current: [0xFF, 0xFF, 0xFF],
        background: [0x00, 0x00, 0x00],
        selected: [0x00, 0x00, 0xC6],
    };

    fn read(file: Option<&[u8]>) -> Self {
        let mut colours = Self::DEFAULT;
        let text = String::from_utf8_lossy(file.unwrap_or_default());
        for line in text.lines() {
            let Some((key, value)) = line.split_once('=') else {
                continue;
            };
            let Some(colour) = parse_colour(value) else {
                continue;
            };
            match key.trim().to_ascii_lowercase().as_str() {
                "normal" => colours.text = colour,
                "current" => colours.current = colour,
                "normalbg" => colours.background = colour,
                "selectedbg" => colours.selected = colour,
                _ => {}
            }
        }
        colours
    }
}

/// `#RRGGBB`, with or without the `#`.
fn parse_colour(value: &str) -> Option<[u8; 3]> {
    let hex = value.trim().trim_start_matches('#');
    if hex.len() != 6 || !hex.is_ascii() {
        return None;
    }
    let channel = |at: usize| u8::from_str_radix(&hex[at..at + 2], 16).ok();
    Some([channel(0)?, channel(2)?, channel(4)?])
}

fn hex(colour: [u8; 3]) -> String {
    format!("#{:02x}{:02x}{:02x}", colour[0], colour[1], colour[2])
}

/// The name shown for the skin: the archive's file name without path and extension.
fn skin_name(file_name: &str) -> String {
    let base = file_name.rsplit(['/', '\\']).next().unwrap_or(file_name);
    let stem = base.rsplit_once('.').map_or(base, |(stem, _)| stem);
    let cleaned: String = stem.chars().filter(|c| !c.is_control()).take(100).collect();
    let cleaned = cleaned.trim();
    if cleaned.is_empty() { "Classic skin".to_owned() } else { cleaned.to_owned() }
}

/// The name as part of a skin id: lower-case letters, digits and single hyphens.
fn slug(name: &str) -> String {
    let mut slug = String::new();
    for c in name.chars() {
        if c.is_ascii_alphanumeric() {
            slug.push(c.to_ascii_lowercase());
        } else if !slug.ends_with('-') && !slug.is_empty() {
            slug.push('-');
        }
    }
    let slug = slug.trim_end_matches('-');
    if slug.is_empty() { "skin".to_owned() } else { slug.chars().take(80).collect() }
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;
    use crate::skins::Skin;
    use crate::skins::manifest::{Layout, image_size};

    const APP: &str = "0.1.0";

    /// A classic skin drawn by this test: every region of every sheet has a colour of its own,
    /// so that a cut-out can be recognised by one pixel.
    pub(crate) fn classic_files() -> SkinFiles {
        let mut main = Image::filled(275, 116, [40, 40, 60]);
        main.fill(9, 22, 257, 44, [0, 20, 0]); // the display
        let mut cbuttons = Image::filled(136, 36, [0, 0, 0]);
        for (index, control) in TRANSPORT.iter().enumerate() {
            let shade = 40 + index as u8 * 30;
            cbuttons.fill(
                control.normal.0,
                control.normal.1,
                control.size.0,
                control.size.1,
                [shade, 0, 0],
            );
            cbuttons.fill(
                control.pressed.0,
                control.pressed.1,
                control.size.0,
                control.size.1,
                [0, shade, 0],
            );
        }
        let mut shufrep = Image::filled(92, 85, [0, 0, 0]);
        for (index, control) in SWITCHES.iter().enumerate() {
            let shade = 40 + index as u8 * 30;
            let size = control.size;
            shufrep.fill(control.normal.0, control.normal.1, size.0, size.1, [shade, 0, 0]);
            shufrep.fill(control.pressed.0, control.pressed.1, size.0, size.1, [0, shade, 0]);
            let active = control.active.unwrap();
            shufrep.fill(active.0, active.1, size.0, size.1, [0, 0, shade]);
        }
        SkinFiles::from([
            ("MAIN.BMP".to_owned(), main.to_bmp()),
            ("CButtons.bmp".to_owned(), cbuttons.to_bmp()),
            ("shufrep.bmp".to_owned(), shufrep.to_bmp()),
            (
                "PLEDIT.TXT".to_owned(),
                b"[Text]\r\nNormal=#00E000\r\nCurrent=#FFFF80\r\nNormalBG=#101018\r\nSelectedBG=#303060\r\nFont=Arial\r\n".to_vec(),
            ),
            ("readme.txt".to_owned(), b"made for a test".to_vec()),
            ("normal.cur".to_owned(), vec![0, 0, 2, 0]),
        ])
    }

    fn components(package: &SkinFiles) -> Vec<Value> {
        let manifest: Value = serde_json::from_slice(&package[MANIFEST_FILE]).unwrap();
        manifest["windows"]["player"]["components"].as_array().unwrap().clone()
    }

    fn button<'a>(components: &'a [Value], action: &str) -> &'a Value {
        components
            .iter()
            .find(|c| c["action"] == action)
            .unwrap_or_else(|| panic!("no button for {action}"))
    }

    #[test]
    fn a_classic_skin_is_recognised_by_its_main_bitmap() {
        assert!(is_classic_skin(&classic_files()));
        let mut ours = classic_files();
        ours.insert("skin.json".to_owned(), b"{}".to_vec());
        assert!(!is_classic_skin(&ours));
        assert!(!is_classic_skin(&SkinFiles::new()));
        let nested = SkinFiles::from([("My Skin/Main.Bmp".to_owned(), vec![])]);
        assert!(is_classic_skin(&nested));
    }

    #[test]
    fn the_result_is_a_valid_skin_of_our_format() {
        let package = convert(&classic_files(), "/downloads/Bento Classic v2.wsz").unwrap();
        let skin = Skin::from_files(package, false, APP).unwrap();
        assert_eq!(skin.id(), "wsz.bento-classic-v2");
        assert_eq!(skin.manifest.name, "Bento Classic v2");
        let player = skin.manifest.windows.player.as_ref().unwrap();
        assert_eq!(player.layout, Layout::Absolute);
        assert_eq!((player.width, player.height), (Some(275), Some(140)));
        assert!(player.pixelated);
        // nothing but our manifest and PNGs: the bitmaps, cursors and texts stay behind
        assert_eq!(image_size(skin.file("assets/background.png").unwrap()), Some((275, 140)));
        assert!(skin.file("MAIN.BMP").is_none());
        assert!(skin.file("readme.txt").is_none());
    }

    #[test]
    fn buttons_sit_where_the_classic_layout_has_them_with_their_cut_out_pictures() {
        let package = convert(&classic_files(), "test.wsz").unwrap();
        let components = components(&package);

        let play = button(&components, "player.play");
        assert_eq!((play["x"].as_u64(), play["y"].as_u64()), (Some(39), Some(88)));
        assert_eq!((play["width"].as_u64(), play["height"].as_u64()), (Some(23), Some(18)));
        assert_eq!(play["states"]["normal"], "assets/play.png");
        assert_eq!(play["states"]["pressed"], "assets/play-pressed.png");
        assert!(play["states"]["active"].is_null());
        assert_eq!(image_size(&package["assets/play.png"]), Some((23, 18)));
        assert_eq!(image_size(&package["assets/eject.png"]), Some((22, 16)));

        for (action, at) in [
            ("player.previous", (16, 88)),
            ("player.pause", (62, 88)),
            ("player.stop", (85, 88)),
            ("player.next", (108, 88)),
            ("player.open", (136, 89)),
            ("player.shuffle", (164, 89)),
            ("player.repeat", (211, 89)),
            ("window.equalizer", (219, 58)),
            ("window.playlist", (242, 58)),
        ] {
            let b = button(&components, action);
            assert_eq!((b["x"].as_u64(), b["y"].as_u64()), (Some(at.0), Some(at.1)), "{action}");
        }
        let shuffle = button(&components, "player.shuffle");
        assert_eq!(shuffle["states"]["active"], "assets/shuffle-active.png");
        assert_eq!(image_size(&package["assets/shuffle-active.png"]), Some((47, 15)));
    }

    #[test]
    fn the_right_rectangle_is_cut_out_of_the_sheet() {
        // read the sheet back and compare with what the test drew
        let files = classic_files();
        let sheet = Image::from_bmp(&files["CButtons.bmp"]).unwrap();
        let stop = &TRANSPORT[3];
        let normal = sheet.crop(stop.normal.0, stop.normal.1, stop.size.0, stop.size.1).unwrap();
        assert_eq!(normal.pixel(0, 0), Some([130, 0, 0]));
        assert_eq!(normal.pixel(22, 17), Some([130, 0, 0]));
        let pressed = sheet.crop(stop.pressed.0, stop.pressed.1, stop.size.0, stop.size.1).unwrap();
        assert_eq!(pressed.pixel(0, 0), Some([0, 130, 0]));
    }

    #[test]
    fn the_way_to_the_skins_is_added_below_the_classic_face() {
        let package = convert(&classic_files(), "test.wsz").unwrap();
        let components = components(&package);
        let skins = button(&components, "app.skins");
        assert!(skins["states"].is_null(), "drawn by the app");
        assert_eq!(skins["y"].as_u64(), Some(119));
        assert!(skins["x"].as_u64().unwrap() + skins["width"].as_u64().unwrap() <= 275);
        // the classic face has buttons for playlist and equalizer: no second ones in the strip
        assert_eq!(components.iter().filter(|c| c["action"] == "window.playlist").count(), 1);
        assert!(!components.iter().any(|c| c["action"] == "player.togglePlay"));
    }

    #[test]
    fn a_skin_with_only_the_main_bitmap_still_gets_everything_it_needs() {
        let mut files = classic_files();
        files.retain(|name, _| name == "MAIN.BMP");
        let package = convert(&files, "bare.wsz").unwrap();
        let components = components(&package);
        for action in ["player.togglePlay", "app.skins", "window.playlist", "window.equalizer"] {
            assert!(button(&components, action)["states"].is_null(), "{action}");
        }
        assert!(Skin::from_files(package, false, APP).is_ok());
    }

    #[test]
    fn a_broken_button_sheet_costs_only_its_buttons() {
        let mut files = classic_files();
        files.insert("CButtons.bmp".to_owned(), b"BMnot really".to_vec());
        // too small for the equalizer and playlist buttons, large enough for shuffle and repeat
        let small = Image::filled(92, 45, [5, 5, 5]);
        files.insert("shufrep.bmp".to_owned(), small.to_bmp());
        let package = convert(&files, "test.wsz").unwrap();
        let components = components(&package);
        assert!(!components.iter().any(|c| c["action"] == "player.stop"));
        assert!(!button(&components, "player.shuffle")["states"].is_null());
        // what could not be cut out is offered in the strip instead
        assert!(button(&components, "player.togglePlay")["states"].is_null());
        assert!(button(&components, "window.equalizer")["states"].is_null());
        assert!(Skin::from_files(package, false, APP).is_ok());
    }

    #[test]
    fn colours_come_from_pledit_txt() {
        let package = convert(&classic_files(), "test.wsz").unwrap();
        let manifest: Value = serde_json::from_slice(&package[MANIFEST_FILE]).unwrap();
        assert_eq!(manifest["theme"]["foreground"], "#00e000");
        assert_eq!(manifest["theme"]["accent"], "#ffff80");
        assert_eq!(manifest["theme"]["background"], "#101018");
        assert_eq!(manifest["theme"]["surfaceRaised"], "#303060");
        // the strip below the face is in the playlist's background colour
        let skin = Skin::from_files(package, false, APP).unwrap();
        assert!(skin.manifest.theme.radius == Some(0));
    }

    #[test]
    fn the_display_gets_title_time_sliders_and_the_visualizer_at_their_classic_places() {
        let package = convert(&classic_files(), "test.wsz").unwrap();
        let components = components(&package);
        let of = |kind: &str| components.iter().find(|c| c["type"] == kind).unwrap().clone();
        assert_eq!(of("text")["source"], "track.title");
        assert_eq!(
            (of("text")["x"].as_u64(), of("text")["width"].as_u64()),
            (Some(111), Some(154))
        );
        assert_eq!(of("time")["source"], "position");
        assert_eq!(
            (of("seekbar")["x"].as_u64(), of("seekbar")["y"].as_u64()),
            (Some(16), Some(72))
        );
        assert_eq!((of("volume")["x"].as_u64(), of("volume")["y"].as_u64()), (Some(107), Some(57)));
        let spectrum = of("spectrum");
        assert_eq!((spectrum["x"].as_u64(), spectrum["y"].as_u64()), (Some(24), Some(43)));
        assert_eq!(spectrum["color"], "#ffff80");
    }

    #[test]
    fn colours_fall_back_to_green_on_black() {
        assert_eq!(PlaylistColours::read(None), PlaylistColours::DEFAULT);
        assert_eq!(PlaylistColours::read(Some(b"\xff\xfe garbage")), PlaylistColours::DEFAULT);
        let partial = PlaylistColours::read(Some(b"normal = 123456\nCurrent=#xyz\nNormalBG=#12"));
        assert_eq!(partial.text, [0x12, 0x34, 0x56]);
        assert_eq!(partial.current, PlaylistColours::DEFAULT.current);
        assert_eq!(partial.background, PlaylistColours::DEFAULT.background);
    }

    #[test]
    fn a_skin_without_a_usable_main_bitmap_is_refused_with_the_reason() {
        let none = convert(&SkinFiles::new(), "x.wsz").unwrap_err();
        assert_eq!(none[0].at, "main.bmp");

        let mut files = classic_files();
        files.insert("MAIN.BMP".to_owned(), Image::filled(100, 50, [0, 0, 0]).to_bmp());
        let small = convert(&files, "x.wsz").unwrap_err();
        assert!(small[0].message.contains("100 × 50"), "{small:?}");

        files.insert("MAIN.BMP".to_owned(), b"not a bitmap".to_vec());
        let broken = convert(&files, "x.wsz").unwrap_err();
        assert!(broken[0].message.contains("not a Windows bitmap"));
    }

    #[test]
    fn names_and_ids_are_made_from_the_file_name() {
        assert_eq!(skin_name("C:\\Skins\\Nucleo NLog v102.wsz"), "Nucleo NLog v102");
        assert_eq!(skin_name("/a/b/base-2.91.wsz"), "base-2.91");
        assert_eq!(skin_name(".wsz"), "Classic skin");
        assert_eq!(skin_name(""), "Classic skin");
        assert_eq!(slug("Nucleo NLog v102"), "nucleo-nlog-v102");
        assert_eq!(slug("  ¡Ünïcode! & Co.  "), "n-code-co");
        assert_eq!(slug("###"), "skin");
        assert_eq!(slug("../../etc/passwd"), "etc-passwd");
        // whatever the file is called, the id is one our format accepts
        for name in ["", "9", "A", "ä", "x".repeat(300).as_str(), "a..b", "-"] {
            let id = format!("wsz.{}", slug(&skin_name(name)));
            assert!(crate::skins::manifest::is_valid_id(&id), "{name:?} → {id}");
        }
    }
}
