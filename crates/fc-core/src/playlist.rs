//! The playlist: an ordered list of tracks, the current one, repeat and shuffle.
//!
//! Pure data and rules – no audio, no files, no threads. [`crate::session`] connects it to the
//! player.

use crate::error::ErrorCode;
use crate::metadata::TrackMeta;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RepeatMode {
    /// Stop after the last track.
    #[default]
    Off,
    /// Repeat the current track.
    One,
    /// Start over after the last track.
    All,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaylistEntry {
    /// Stable while the app runs; a file can be in the list more than once.
    pub id: u64,
    pub path: PathBuf,
    pub file_name: String,
    /// `None` until the tags have been read.
    pub meta: Option<TrackMeta>,
    /// Why the track could not be played when it was last tried.
    pub error: Option<ErrorCode>,
}

impl PlaylistEntry {
    fn playable(&self) -> bool {
        self.error.is_none()
    }
}

/// What a window shows of the playlist.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaylistState {
    pub entries: Vec<PlaylistEntry>,
    pub current_id: Option<u64>,
    pub repeat: RepeatMode,
    pub shuffle: bool,
}

/// Why the playlist moves to another track.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Advance {
    /// The current track was played to its end (or could not be played).
    Auto,
    /// The user asked for the next track.
    Next,
    /// The user asked for the previous track.
    Previous,
}

#[derive(Debug, Clone)]
pub struct Playlist {
    entries: Vec<PlaylistEntry>,
    next_id: u64,
    current: Option<u64>,
    repeat: RepeatMode,
    shuffle: bool,
    /// Play order while shuffling: every id once.
    order: Vec<u64>,
    rng: u64,
}

impl Playlist {
    /// `seed` drives the shuffle; the same seed gives the same order (for tests).
    pub fn new(seed: u64) -> Self {
        Self {
            entries: Vec::new(),
            next_id: 1,
            current: None,
            repeat: RepeatMode::Off,
            shuffle: false,
            order: Vec::new(),
            // xorshift must not start at zero
            rng: seed | 1,
        }
    }

    pub fn state(&self) -> PlaylistState {
        PlaylistState {
            entries: self.entries.clone(),
            current_id: self.current,
            repeat: self.repeat,
            shuffle: self.shuffle,
        }
    }

    pub fn len(&self) -> usize {
        self.entries.len()
    }

    pub fn is_empty(&self) -> bool {
        self.entries.is_empty()
    }

    pub fn entries(&self) -> &[PlaylistEntry] {
        &self.entries
    }

    pub fn current(&self) -> Option<&PlaylistEntry> {
        self.current.and_then(|id| self.entry(id))
    }

    pub fn entry(&self, id: u64) -> Option<&PlaylistEntry> {
        self.entries.iter().find(|e| e.id == id)
    }

    pub fn repeat(&self) -> RepeatMode {
        self.repeat
    }

    pub fn shuffle(&self) -> bool {
        self.shuffle
    }

    /// Appends `paths` and returns the ids of the new entries, in order.
    pub fn add(&mut self, paths: impl IntoIterator<Item = PathBuf>) -> Vec<u64> {
        let mut ids = Vec::new();
        for path in paths {
            let id = self.next_id;
            self.next_id += 1;
            let file_name = file_name_of(&path);
            self.entries.push(PlaylistEntry { id, path, file_name, meta: None, error: None });
            ids.push(id);
        }
        if self.shuffle {
            // new tracks come somewhere after the current one
            let start = self.order_position().map_or(0, |p| p + 1);
            for id in &ids {
                let at = start + self.random_below(self.order.len() - start + 1);
                self.order.insert(at, *id);
            }
        }
        ids
    }

    /// Removes entries. Returns `true` if the current track was among them.
    pub fn remove(&mut self, ids: &[u64]) -> bool {
        let removed_current = self.current.is_some_and(|c| ids.contains(&c));
        self.entries.retain(|e| !ids.contains(&e.id));
        self.order.retain(|id| !ids.contains(id));
        if removed_current {
            self.current = None;
        }
        removed_current
    }

    pub fn clear(&mut self) {
        self.entries.clear();
        self.order.clear();
        self.current = None;
    }

    /// Makes `id` the current track. Returns `false` if there is no such entry.
    pub fn select(&mut self, id: u64) -> bool {
        if self.entry(id).is_none() {
            return false;
        }
        self.current = Some(id);
        true
    }

    /// Nothing is current any more (the list keeps its tracks).
    pub fn deselect(&mut self) {
        self.current = None;
    }

    pub fn set_repeat(&mut self, repeat: RepeatMode) {
        self.repeat = repeat;
    }

    pub fn set_shuffle(&mut self, shuffle: bool) {
        if shuffle == self.shuffle {
            return;
        }
        self.shuffle = shuffle;
        if shuffle {
            self.reshuffle();
        } else {
            self.order.clear();
        }
    }

    pub fn set_meta(&mut self, id: u64, meta: TrackMeta) {
        if let Some(entry) = self.entries.iter_mut().find(|e| e.id == id) {
            entry.meta = Some(meta);
        }
    }

    /// Records that a track cannot be played (`Some`) or can be again (`None`).
    pub fn set_error(&mut self, id: u64, error: Option<ErrorCode>) {
        if let Some(entry) = self.entries.iter_mut().find(|e| e.id == id) {
            entry.error = error;
        }
    }

    /// Moves to the track that follows from `why` and makes it current. `None`: playback ends
    /// (the current track stays current). Tracks marked as unplayable are passed over.
    pub fn advance(&mut self, why: Advance) -> Option<u64> {
        if why == Advance::Auto
            && self.repeat == RepeatMode::One
            && let Some(current) = self.current().filter(|e| e.playable())
        {
            return Some(current.id);
        }
        let order = self.play_order();
        if order.is_empty() {
            return None;
        }
        let len = order.len();
        let backwards = why == Advance::Previous;
        let mut position = self.current.and_then(|c| order.iter().position(|id| *id == c));
        for _ in 0..len {
            let next = match (position, backwards) {
                (None, false) => 0,
                (None, true) => len - 1,
                (Some(p), false) if p + 1 < len => p + 1,
                (Some(p), true) if p > 0 => p - 1,
                // at the end (or the start): only "repeat all" goes round
                (Some(_), false) if self.repeat == RepeatMode::All => {
                    if self.shuffle {
                        // a new round in a new order
                        self.reshuffle_all();
                        return self.first_playable_in_order();
                    }
                    0
                }
                (Some(_), true) if self.repeat == RepeatMode::All => len - 1,
                _ => return None,
            };
            let id = order[next];
            if self.entry(id).is_some_and(PlaylistEntry::playable) {
                self.current = Some(id);
                return Some(id);
            }
            position = Some(next);
        }
        None
    }

    fn first_playable_in_order(&mut self) -> Option<u64> {
        let id = self
            .order
            .iter()
            .copied()
            .find(|id| self.entry(*id).is_some_and(PlaylistEntry::playable))?;
        self.current = Some(id);
        Some(id)
    }

    /// Ids in the order they are played.
    fn play_order(&self) -> Vec<u64> {
        if self.shuffle { self.order.clone() } else { self.entries.iter().map(|e| e.id).collect() }
    }

    fn order_position(&self) -> Option<usize> {
        self.current.and_then(|c| self.order.iter().position(|id| *id == c))
    }

    /// A new random order that starts with the current track (it is playing already).
    fn reshuffle(&mut self) {
        self.reshuffle_all();
        if let Some(position) = self.order_position() {
            let current = self.order.remove(position);
            self.order.insert(0, current);
        }
    }

    fn reshuffle_all(&mut self) {
        self.order = self.entries.iter().map(|e| e.id).collect();
        // Fisher–Yates
        for i in (1..self.order.len()).rev() {
            let j = self.random_below(i + 1);
            self.order.swap(i, j);
        }
    }

    /// xorshift64: good enough to shuffle, no dependency.
    fn random_below(&mut self, bound: usize) -> usize {
        self.rng ^= self.rng << 13;
        self.rng ^= self.rng >> 7;
        self.rng ^= self.rng << 17;
        if bound == 0 { 0 } else { (self.rng % bound as u64) as usize }
    }
}

fn file_name_of(path: &Path) -> String {
    path.file_name()
        .map_or_else(|| path.display().to_string(), |n| n.to_string_lossy().into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn playlist(tracks: usize) -> (Playlist, Vec<u64>) {
        let mut list = Playlist::new(42);
        let ids = list.add((1..=tracks).map(|n| PathBuf::from(format!("music/{n:02}.flac"))));
        (list, ids)
    }

    /// The ids `advance` yields until playback ends (at most `limit`).
    fn play_through(list: &mut Playlist, why: Advance, limit: usize) -> Vec<u64> {
        std::iter::from_fn(|| list.advance(why)).take(limit).collect()
    }

    #[test]
    fn entries_get_ids_and_names_in_order() {
        let (list, ids) = playlist(3);
        assert_eq!(ids, [1, 2, 3]);
        assert_eq!(list.len(), 3);
        assert_eq!(list.entries()[1].file_name, "02.flac");
        assert_eq!(list.current(), None);
        assert!(Playlist::new(1).is_empty());
    }

    #[test]
    fn the_same_file_can_be_in_the_list_twice() {
        let mut list = Playlist::new(1);
        let ids = list.add([PathBuf::from("a.flac"), PathBuf::from("a.flac")]);
        assert_ne!(ids[0], ids[1]);
        assert_eq!(list.len(), 2);
    }

    #[test]
    fn plays_from_the_first_track_to_the_last_and_stops() {
        let (mut list, ids) = playlist(3);
        assert_eq!(play_through(&mut list, Advance::Auto, 10), ids);
        // the last track stays current: "play" starts it again
        assert_eq!(list.current().map(|e| e.id), Some(3));
    }

    #[test]
    fn repeat_all_starts_over_and_repeat_one_stays() {
        let (mut list, _) = playlist(3);
        list.set_repeat(RepeatMode::All);
        assert_eq!(play_through(&mut list, Advance::Auto, 7), [1, 2, 3, 1, 2, 3, 1]);

        list.set_repeat(RepeatMode::One);
        assert_eq!(play_through(&mut list, Advance::Auto, 3), [1, 1, 1]);
        // the user's "next" leaves the repeated track
        assert_eq!(list.advance(Advance::Next), Some(2));
    }

    #[test]
    fn next_and_previous_stop_at_the_ends_unless_repeating_all() {
        let (mut list, _) = playlist(3);
        list.select(3);
        assert_eq!(list.advance(Advance::Next), None);
        assert_eq!(list.advance(Advance::Previous), Some(2));
        assert_eq!(list.advance(Advance::Previous), Some(1));
        assert_eq!(list.advance(Advance::Previous), None);
        assert_eq!(list.current().map(|e| e.id), Some(1));

        list.set_repeat(RepeatMode::All);
        assert_eq!(list.advance(Advance::Previous), Some(3));
        assert_eq!(list.advance(Advance::Next), Some(1));
    }

    #[test]
    fn without_a_current_track_next_is_the_first_and_previous_the_last() {
        let (mut list, _) = playlist(3);
        assert_eq!(list.advance(Advance::Next), Some(1));
        list.deselect();
        assert_eq!(list.advance(Advance::Previous), Some(3));
        assert_eq!(Playlist::new(1).advance(Advance::Next), None);
    }

    #[test]
    fn unplayable_tracks_are_passed_over_in_both_directions() {
        let (mut list, _) = playlist(4);
        list.set_error(2, Some(ErrorCode::NotFound));
        list.set_error(3, Some(ErrorCode::DecodeFailed));
        assert_eq!(play_through(&mut list, Advance::Auto, 10), [1, 4]);
        assert_eq!(list.advance(Advance::Previous), Some(1));

        // found again: played again
        list.set_error(2, None);
        assert_eq!(list.advance(Advance::Next), Some(2));
    }

    #[test]
    fn a_list_of_only_unplayable_tracks_ends_instead_of_looping() {
        let (mut list, ids) = playlist(3);
        for id in ids {
            list.set_error(id, Some(ErrorCode::NotFound));
        }
        list.set_repeat(RepeatMode::All);
        assert_eq!(list.advance(Advance::Auto), None);
        list.set_shuffle(true);
        assert_eq!(list.advance(Advance::Auto), None);
        list.set_repeat(RepeatMode::One);
        list.select(1);
        assert_eq!(list.advance(Advance::Auto), None);
    }

    #[test]
    fn shuffle_plays_every_track_once_starting_with_the_current() {
        let (mut list, ids) = playlist(20);
        list.select(7);
        list.set_shuffle(true);
        let mut played = vec![7];
        played.extend(play_through(&mut list, Advance::Auto, 100));
        assert_eq!(played.len(), 20, "{played:?}");
        assert_ne!(played, ids, "not shuffled");
        let mut sorted = played.clone();
        sorted.sort_unstable();
        assert_eq!(sorted, ids);
    }

    #[test]
    fn shuffle_with_repeat_all_starts_a_new_round_in_a_new_order() {
        let (mut list, ids) = playlist(8);
        list.set_shuffle(true);
        list.set_repeat(RepeatMode::All);
        let first: Vec<u64> = play_through(&mut list, Advance::Auto, 8);
        let second: Vec<u64> = play_through(&mut list, Advance::Auto, 8);
        for round in [&first, &second] {
            let mut sorted = round.clone();
            sorted.sort_unstable();
            assert_eq!(sorted, ids);
        }
        assert_ne!(first, second);
    }

    #[test]
    fn previous_goes_back_through_the_shuffled_order() {
        let (mut list, _) = playlist(6);
        list.set_shuffle(true);
        let forward: Vec<u64> = play_through(&mut list, Advance::Auto, 4);
        assert_eq!(list.advance(Advance::Previous), Some(forward[2]));
        assert_eq!(list.advance(Advance::Previous), Some(forward[1]));
    }

    #[test]
    fn tracks_added_while_shuffling_are_still_to_come() {
        let (mut list, _) = playlist(5);
        list.set_shuffle(true);
        let played: Vec<u64> = play_through(&mut list, Advance::Auto, 3);
        let added = list.add([PathBuf::from("new-1.flac"), PathBuf::from("new-2.flac")]);
        let rest: Vec<u64> = play_through(&mut list, Advance::Auto, 100);
        assert_eq!(played.len() + rest.len(), 7);
        assert!(added.iter().all(|id| rest.contains(id)), "{rest:?}");
    }

    #[test]
    fn turning_shuffle_off_continues_in_list_order() {
        let (mut list, _) = playlist(5);
        list.set_shuffle(true);
        list.select(3);
        list.set_shuffle(false);
        assert_eq!(play_through(&mut list, Advance::Auto, 10), [4, 5]);
    }

    #[test]
    fn removing_tracks_keeps_the_rest_and_reports_the_current_one() {
        let (mut list, _) = playlist(4);
        list.select(2);
        assert!(!list.remove(&[4]));
        assert_eq!(list.current().map(|e| e.id), Some(2));
        assert!(list.remove(&[2, 99]));
        assert_eq!(list.current(), None);
        assert_eq!(list.entries().iter().map(|e| e.id).collect::<Vec<_>>(), [1, 3]);
        // ids are not reused
        assert_eq!(list.add([PathBuf::from("x.flac")]), [5]);

        list.clear();
        assert!(list.is_empty());
        assert_eq!(list.advance(Advance::Next), None);
    }

    #[test]
    fn selecting_an_unknown_track_changes_nothing() {
        let (mut list, _) = playlist(2);
        list.select(1);
        assert!(!list.select(99));
        assert_eq!(list.current().map(|e| e.id), Some(1));
    }

    #[test]
    fn metadata_and_errors_show_in_the_state() {
        let (mut list, _) = playlist(2);
        let meta = TrackMeta { title: Some("People".into()), ..TrackMeta::default() };
        list.set_meta(1, meta.clone());
        list.set_meta(99, meta.clone());
        list.set_error(2, Some(ErrorCode::NotFound));
        list.select(1);
        list.set_repeat(RepeatMode::All);
        let json = serde_json::to_value(list.state()).unwrap();
        assert_eq!(json["currentId"], 1);
        assert_eq!(json["repeat"], "all");
        assert_eq!(json["shuffle"], false);
        assert_eq!(
            json["entries"][0],
            serde_json::json!({
                "id": 1, "path": "music/01.flac", "fileName": "01.flac",
                "meta": { "title": "People", "artist": null, "album": null, "durationMs": null },
                "error": null
            })
        );
        assert_eq!(json["entries"][1]["meta"], serde_json::Value::Null);
        assert_eq!(json["entries"][1]["error"], "not_found");
    }
}
