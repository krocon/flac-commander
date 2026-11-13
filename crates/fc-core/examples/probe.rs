//! Phase 0 evaluation: what Symphonia (stream) and Lofty (tags) say about files.
//!
//! `cargo run -p fc-core --example probe -- <file>…`

use fc_core::audio::decode::probe_file;
use lofty::file::{AudioFile, TaggedFileExt};
use lofty::tag::Accessor;
use std::path::Path;
use std::process::ExitCode;

fn main() -> ExitCode {
    let paths: Vec<String> = std::env::args().skip(1).collect();
    if paths.is_empty() {
        eprintln!("usage: probe <file>…");
        return ExitCode::from(2);
    }
    let mut failed = false;
    for path in &paths {
        println!("{path}");
        match probe_file(Path::new(path)) {
            Ok(info) => println!(
                "  stream: {} / {}, {} Hz, {} ch, {} bit, {} ms",
                info.container,
                info.codec,
                info.sample_rate,
                info.channels,
                info.bits_per_sample.map_or_else(|| "-".to_owned(), |b| b.to_string()),
                info.duration_ms.map_or_else(|| "?".to_owned(), |d| d.to_string()),
            ),
            Err(e) => {
                failed = true;
                println!("  stream: ERROR {:?}: {} ({:?})", e.code, e.message, e.details);
            }
        }
        match lofty::read_from_path(path) {
            Ok(file) => {
                let duration = file.properties().duration().as_millis();
                match file.primary_tag().or_else(|| file.first_tag()) {
                    Some(tag) => println!(
                        "  tags:   {:?}: title={:?} artist={:?} album={:?} pictures={} ({duration} ms)",
                        tag.tag_type(),
                        tag.title().as_deref(),
                        tag.artist().as_deref(),
                        tag.album().as_deref(),
                        tag.pictures().len(),
                    ),
                    None => println!("  tags:   none ({duration} ms)"),
                }
            }
            Err(e) => println!("  tags:   ERROR {e}"),
        }
    }
    if failed { ExitCode::FAILURE } else { ExitCode::SUCCESS }
}
