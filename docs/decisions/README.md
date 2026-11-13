# Architekturentscheidungen (ADRs)

Kurze Protokolle: Kontext, Entscheidung, Folgen. Eine Entscheidung wird nicht umgeschrieben, sondern durch eine neue
ersetzt (Status „ersetzt durch …").

| Nr. | Entscheidung | Status |
| --- | --- | --- |
| [0001](0001-cargo-workspace-mit-kern-crate.md) | Cargo-Workspace mit eigener Kern-Crate ohne Tauri | angenommen |
| [0002](0002-ipc-commands-events-fassaden.md) | IPC über Commands und Events hinter typisierten Fassaden | angenommen |
| [0003](0003-audio-bibliotheken.md) | Symphonia, CPAL, Lofty; Ringpuffer mit rtrb | angenommen |
| [0004](0004-frontend-zustand-und-texte.md) | Signal-Stores je Feature, Laufzeit-i18n, CSS-Variablen als Skin-Schnittstelle | angenommen |
| [0005](0005-logging.md) | Logging mit `log` und tauri-plugin-log | angenommen |
| [0006](0006-resampling-opus-seek.md) | Resampling mit rubato, Opus über libopus, Seek mit neu geöffnetem Strom | angenommen |
| [0007](0007-skin-format.md) | Skins sind geprüfte Daten: deklaratives Format, zwei Layout-Arten | angenommen |
| [0008](0008-mehrere-fenster.md) | Mehrere Fenster: je Fenster eine WebView, Synchronität über Rust-Events | angenommen |
| [0009](0009-equalizer-spektrum-gapless.md) | Equalizer im Callback, Spektrum als Abzweig, Gapless durch Vorladen | angenommen |
| [0010](0010-klassische-skins-und-plugins.md) | Klassische Skins werden konvertiert; keine Plugin-API | angenommen |
