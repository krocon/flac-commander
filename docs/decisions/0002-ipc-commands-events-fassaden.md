# 0002 – IPC über Commands und Events hinter typisierten Fassaden

Status: angenommen (2026-11-13)

## Kontext

Tauri 2 bietet Commands (Anfrage/Antwort), Events (Broadcast) und Channels (Strom zu einem Aufrufer). Mehrere Fenster
sollen später denselben Zustand zeigen; Tests sollen ohne Tauri laufen.

## Entscheidung

- **Commands** für alles mit Antwort; immer `async`, Blockierendes über `spawn_blocking`.
- **Events** für Zustandsänderungen, die das Backend von sich aus meldet. Namen als `bereich://ereignis`, Payload als
  eigener Typ mit Test der JSON-Form. Events erreichen alle Fenster – das ist die Grundlage der Mehrfenster-Synchronität.
- **Channels** erst, wenn ein lang laufender Auftrag Fortschritt an genau einen Aufrufer meldet (Bibliotheksscan).
- Im Frontend gibt es genau eine Stelle für `invoke()` (`core/backend/call.ts`) und eine für `listen()`
  (`core/backend/events.ts`). Features sprechen mit abstrakten Klassen (`SystemApi`), die in `app.config.ts` an die
  Tauri-Implementierung gebunden werden.
- Fehler sind immer `AppError { code, message, details? }`; die Code-Liste wird auf beiden Seiten von Hand gepflegt
  und auf beiden Seiten getestet.
- DTOs werden von Hand gespiegelt (`camelCase`), mit einem Test je Seite. Kein Codegenerator.

## Folgen

- Stores sind mit Fake-Fassaden vollständig testbar; die Reihenfolge von Antworten bestimmt der Test.
- Ein neues Fenster braucht zusätzlich einen Schnappschuss-Command, weil es frühere Events nicht gesehen hat.
- Handgepflegte DTOs kosten Disziplin; die Vertragstests fangen Abweichungen ab. Wächst die Zahl stark, wird ein
  Generator (z. B. `specta`) neu bewertet.
