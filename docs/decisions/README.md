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
