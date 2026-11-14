#![allow(clippy::unwrap_used)]

use super::*;
use std::fs;

fn fixture(name: &str) -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures").join(name)
}

/// A fresh folder per test under the target directory, canonical like the roots are.
fn folder(test: &str) -> PathBuf {
    let folder =
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../target/test-tmp/library").join(test);
    let _ = fs::remove_dir_all(&folder);
    fs::create_dir_all(&folder).unwrap();
    fs::canonicalize(folder).unwrap()
}

fn track(to: &Path, fixture_name: &str) {
    fs::create_dir_all(to.parent().unwrap()).unwrap();
    fs::copy(fixture(fixture_name), to).unwrap();
}

/// ```text
/// music/Barbra/People/01 one.flac, 02 two.mp3, notes.txt
/// music/Barbra/Guilty/a.flac
/// music/loose.ogg
/// other/secret.flac
/// ```
fn sample(test: &str) -> (PathBuf, Library) {
    let base = folder(test);
    let music = base.join("music");
    track(&music.join("Barbra/People/01 one.flac"), "sine.flac");
    track(&music.join("Barbra/People/02 two.mp3"), "sine.mp3");
    fs::write(music.join("Barbra/People/notes.txt"), "no music").unwrap();
    track(&music.join("Barbra/Guilty/a.flac"), "sine.flac");
    track(&music.join("loose.ogg"), "sine.ogg");
    track(&base.join("other/secret.flac"), "sine.flac");
    let library = Library::new(std::slice::from_ref(&music));
    (base, library)
}

fn text(path: &Path) -> &str {
    path.to_str().unwrap()
}

fn names(folders: &[FolderItem]) -> Vec<&str> {
    folders.iter().map(|f| f.name.as_str()).collect()
}

#[test]
fn roots_are_folders_that_exist_and_none_lies_inside_another() {
    let (base, library) = sample("roots");
    let music = base.join("music");
    assert_eq!(library.roots(), std::slice::from_ref(&music));
    // inside a root, or the root again: nothing changes
    assert!(!library.add_root(&music.join("Barbra")).unwrap());
    assert!(!library.add_root(&music).unwrap());
    // a file and a folder that is not there are refused
    assert_eq!(library.add_root(&music.join("loose.ogg")).unwrap_err().code, ErrorCode::NotFound);
    assert_eq!(library.add_root(&base.join("nowhere")).unwrap_err().code, ErrorCode::NotFound);
    // a folder around a root takes its place
    assert!(library.add_root(&base).unwrap());
    assert_eq!(library.roots(), std::slice::from_ref(&base));
    assert_eq!(library.state().roots, [Crumb { name: "roots".into(), path: text(&base).into() }]);

    assert!(!library.remove_root("/somewhere/else"));
    assert!(library.remove_root(text(&base)));
    assert!(library.roots().is_empty());
    // a root of last time that is not there now is kept and shown, empty; nonsense is not
    let gone = base.join("nowhere");
    let restored = Library::new(&[gone.clone(), music.clone(), PathBuf::from("relative")]);
    assert_eq!(restored.roots(), [gone.clone(), music]);
    let top = restored.browse(None).unwrap();
    assert_eq!(names(&top.folders), ["nowhere", "music"]);
    assert_eq!(top.folders[0].tracks, 0);
    assert_eq!(restored.browse(Some(text(&gone))).unwrap_err().code, ErrorCode::NotFound);
    restored.scan_now();
    assert_eq!(restored.state().scan.tracks, 4);
}

#[test]
fn only_what_lies_inside_a_root_is_resolved() {
    let (base, library) = sample("resolve");
    let music = base.join("music");
    assert_eq!(library.resolve(text(&music)).unwrap(), music);
    assert!(library.resolve(text(&music.join("Barbra/People/01 one.flac"))).is_ok());

    let denied = |path: &Path| library.resolve(text(path)).unwrap_err().code;
    assert_eq!(denied(&base.join("other/secret.flac")), ErrorCode::PermissionDenied);
    assert_eq!(denied(&base), ErrorCode::PermissionDenied);
    // dots that lead out of the root
    assert_eq!(denied(&music.join("../other/secret.flac")), ErrorCode::PermissionDenied);
    assert_eq!(denied(&music.join("Barbra/../../other")), ErrorCode::PermissionDenied);
    assert_eq!(denied(&music.join("missing")), ErrorCode::NotFound);
    assert!(library.resolve("").is_err());
    assert!(library.resolve("music").is_err());

    for refused in [base.join("other"), base.join("other/secret.flac")] {
        assert!(library.browse(Some(text(&refused))).is_err());
        assert!(library.playable(text(&refused)).is_err());
        assert!(library.cover_track(text(&refused)).is_err());
    }
}

#[cfg(unix)]
#[test]
fn a_link_inside_a_root_does_not_lead_out_of_it() {
    let (base, library) = sample("links");
    let music = base.join("music");
    std::os::unix::fs::symlink(base.join("other"), music.join("way-out")).unwrap();
    std::os::unix::fs::symlink(base.join("other/secret.flac"), music.join("linked.flac")).unwrap();

    let listing = library.browse(Some(text(&music))).unwrap();
    assert_eq!(names(&listing.folders), ["Barbra"]);
    assert_eq!(listing.tracks.len(), 1);
    assert!(library.resolve(text(&music.join("way-out"))).is_err());
    assert!(library.resolve(text(&music.join("way-out/secret.flac"))).is_err());
    assert!(library.resolve(text(&music.join("linked.flac"))).is_err());
    library.scan_now();
    assert_eq!(library.state().scan.tracks, 4);
}

#[test]
fn browsing_shows_roots_then_folders_and_tracks_with_their_tags() {
    let (base, library) = sample("browse");
    let music = base.join("music");

    let top = library.browse(None).unwrap();
    assert_eq!(top.folder, None);
    assert!(top.crumbs.is_empty());
    assert_eq!(names(&top.folders), ["music"]);
    assert_eq!(top.folders[0].tracks, 1);

    let root = library.browse(Some(text(&music))).unwrap();
    assert_eq!(root.crumbs, [Crumb { name: "music".into(), path: text(&music).into() }]);
    assert_eq!(names(&root.folders), ["Barbra"]);
    assert_eq!(root.folders[0].tracks, 0);
    assert_eq!(root.folders[0].artist, None);
    assert_eq!(root.tracks.len(), 1);
    assert_eq!(root.tracks[0].name, "loose.ogg");
    assert_eq!(root.tracks[0].title.as_deref(), Some("Sine"));

    let artist = library.browse(Some(text(&music.join("Barbra")))).unwrap();
    // sorted by name; a folder with tracks carries the artist of its first one
    assert_eq!(names(&artist.folders), ["Guilty", "People"]);
    assert_eq!(artist.folders[1].tracks, 2);
    assert_eq!(artist.folders[1].artist.as_deref(), Some("fc-core"));
    assert!(artist.tracks.is_empty());

    let album = library.browse(Some(text(&music.join("Barbra/People")))).unwrap();
    assert_eq!(
        album.crumbs.iter().map(|c| c.name.as_str()).collect::<Vec<_>>(),
        ["music", "Barbra", "People"]
    );
    assert_eq!(album.crumbs[1].path, text(&music.join("Barbra")));
    assert_eq!(album.folder.as_ref().map(|f| (f.name.as_str(), f.tracks)), Some(("People", 2)));
    // only audio files, by name
    let files: Vec<_> = album.tracks.iter().map(|t| t.name.as_str()).collect();
    assert_eq!(files, ["01 one.flac", "02 two.mp3"]);
    let duration = album.tracks[0].duration_ms.unwrap();
    assert!((950..=1100).contains(&duration), "{duration}");

    // a file is not a folder
    assert!(library.browse(Some(text(&music.join("loose.ogg")))).is_err());
}

#[test]
fn hidden_entries_are_not_shown() {
    let (base, library) = sample("hidden");
    let music = base.join("music");
    track(&music.join(".Trash/gone.flac"), "sine.flac");
    track(&music.join("._loose.ogg"), "sine.ogg");
    let root = library.browse(Some(text(&music))).unwrap();
    assert_eq!(names(&root.folders), ["Barbra"]);
    assert_eq!(root.tracks.len(), 1);
}

#[test]
fn the_scan_reads_every_track_and_tells_how_far_it_is() {
    let (_, library) = sample("scan");
    assert!(library.needs_scan());
    assert_eq!(library.state().scan, ScanState::default());

    let (tx, rx) = std::sync::mpsc::channel();
    library.rescan(move |state| {
        let _ = tx.send(state.clone());
    });
    let states: Vec<LibraryState> = rx.iter().collect(); // ends when the scan drops the sender
    assert!(states.first().unwrap().scan.scanning);
    let last = states.last().unwrap();
    assert_eq!(last.scan, ScanState { scanning: false, folders: 3, tracks: 4 });
    assert_eq!(library.state(), *last);
    assert!(!library.needs_scan());

    // browsing answers from the index now, with the same result
    let top = library.browse(None).unwrap();
    assert_eq!(top.folders[0].tracks, 1);

    // other roots: scan again
    library.remove_root(&library.state().roots[0].path);
    assert!(!library.needs_scan(), "nothing to scan without roots");
    library.scan_now();
    assert_eq!(library.state().scan, ScanState::default());
}

#[test]
fn the_search_finds_albums_and_tracks_by_every_word() {
    let (base, library) = sample("search");
    assert_eq!(library.search("people"), Found::default(), "nothing before the scan");
    library.scan_now();

    // an album by its folder name; its tracks do not have the word themselves
    let found = library.search("PEOPLE");
    assert_eq!(names(&found.albums), ["People"]);
    assert!(found.tracks.is_empty());
    assert!(!found.more);

    // tracks by their title; albums by their artist
    let found = library.search("sine");
    assert!(found.albums.is_empty());
    assert_eq!(found.tracks.len(), 4);
    let found = library.search("fc-core");
    assert_eq!(found.albums.len(), 3);
    assert!(found.tracks.is_empty(), "the artist alone does not list every track");

    // every word must be there: title and artist, file name and title
    assert_eq!(library.search("sine fc-core").tracks.len(), 4);
    let found = library.search("  two   sine ");
    assert_eq!(found.tracks.len(), 1);
    assert_eq!(found.tracks[0].path, text(&base.join("music/Barbra/People/02 two.mp3")));
    assert_eq!(library.search("sine nothing"), Found::default());
    assert_eq!(library.search("   "), Found::default());
    assert_eq!(library.search(&"x".repeat(10_000)), Found::default());
}

#[test]
fn what_is_played_and_whose_cover_is_shown() {
    let (base, library) = sample("play");
    let music = base.join("music");
    let file = music.join("Barbra/People/02 two.mp3");
    assert_eq!(library.playable(text(&file)).unwrap(), std::slice::from_ref(&file));
    // a folder: everything in and below it, in order
    let all = library.playable(text(&music.join("Barbra"))).unwrap();
    assert_eq!(
        all,
        [music.join("Barbra/Guilty/a.flac"), music.join("Barbra/People/01 one.flac"), file.clone()]
    );
    // what cannot be played is not played
    assert!(library.playable(text(&music.join("Barbra/People/notes.txt"))).unwrap().is_empty());

    assert_eq!(library.cover_track(text(&file)).unwrap(), Some(file));
    assert_eq!(
        library.cover_track(text(&music.join("Barbra/People"))).unwrap(),
        Some(music.join("Barbra/People/01 one.flac"))
    );
    // a folder of folders shows the cover of the first album in it
    assert_eq!(
        library.cover_track(text(&music.join("Barbra"))).unwrap(),
        Some(music.join("Barbra/Guilty/a.flac"))
    );
    let empty = music.join("Empty");
    fs::create_dir_all(&empty).unwrap();
    assert_eq!(library.cover_track(text(&empty)).unwrap(), None);
}

#[test]
fn the_state_and_the_listing_go_to_the_frontend_in_camel_case() {
    let (base, library) = sample("json");
    library.scan_now();
    let state = serde_json::to_value(library.state()).unwrap();
    assert_eq!(
        state,
        serde_json::json!({
            "roots": [{ "name": "music", "path": text(&base.join("music")) }],
            "scan": { "scanning": false, "folders": 3, "tracks": 4 }
        })
    );
    let album = base.join("music/Barbra/Guilty");
    let listing = serde_json::to_value(library.browse(Some(text(&album))).unwrap()).unwrap();
    assert_eq!(listing["folder"]["name"], "Guilty");
    assert_eq!(listing["folder"]["tracks"], 1);
    assert_eq!(listing["crumbs"][2]["path"], text(&album));
    assert_eq!(listing["tracks"][0]["name"], "a.flac");
    assert!(listing["tracks"][0]["durationMs"].is_u64());
    assert_eq!(listing["tracks"][0]["album"], serde_json::Value::Null);
    let found = serde_json::to_value(library.search("guilty")).unwrap();
    assert_eq!(found["albums"][0]["artist"], "fc-core");
    assert_eq!(found["more"], false);
}
