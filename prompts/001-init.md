# Projekt-Prompt: Plattformübergreifender Skin-basierter Musikplayer

## Rolle und Auftrag

Du bist ein erfahrener Softwarearchitekt und Senior-Entwickler mit Schwerpunkt auf:

- Angular 22, TypeScript, Signals und zoneless Change Detection
- Rust und nativer Audioverarbeitung
- Tauri 2
- plattformübergreifender Desktop-Entwicklung für Windows, macOS und Linux
- Audio-Decoding, DSP, Audio-Ausgabe und Musikbibliotheken
- Skin-Systemen und pixelorientierten Benutzeroberflächen

Entwirf und implementiere einen modernen, plattformübergreifenden Desktop-Musikplayer. Das Produkt soll die Individualisierbarkeit und den nostalgischen Charakter von Winamp/Webamp aufgreifen, aber eine eigenständige, moderne technische Basis und Produktidentität besitzen.

Arbeitsname: **FLAC Commander** .

Das Ergebnis soll ein tatsächlich lauffähiges, wartbares Desktop-Produkt werden – kein bloßer UI-Prototyp.


## Repo

Github: https://github.com/krocon/flac-commander.git

arbeite selbständige und committe und pushe hier selbständig.

Lokal: /Users/marckronberg/WebstormProjects/video/flac-commander

## Beispiele für Architektur:

- /Users/marckronberg/WebstormProjects/files-and-folders-tauri
- /Users/marckronberg/WebstormProjects/talk-typer

## Beachte

- docs/angular-best-practices.upstream.md
- docs/best-practices.md

---

## 1. Produktvision

Ein leistungsfähiger Musikplayer für lokale Musikbibliotheken mit:

- vollständig austauschbaren Skins
- klassischer Winamp-Anmutung als einem der mitgelieferten Designs
- moderner, eigenständiger Skin-Architektur
- nativer Rust-Audio-Engine
- Unterstützung für Windows, macOS und Linux
- mehreren unabhängig positionierbaren Player-Fenstern
- sauberer Trennung zwischen Audio-Engine, Anwendungslogik und Darstellung
- einer später erweiterbaren Community für Skins und Visualisierungen

Die Anwendung darf nicht einfach Webamp kopieren. Sie soll ein eigenständiges Produkt mit eigener Architektur, eigenem Code und einer klaren Erweiterungsstrategie sein.

### Leitprinzipien

1. **Audio läuft unabhängig von der UI.** Das Schließen, Neuladen oder Blockieren einer WebView darf die Wiedergabe nicht beenden.
2. **Skins verändern die Darstellung, nicht die Geschäftslogik.**
3. **Keine unnötigen Abhängigkeiten.** Bevorzuge gut gepflegte, plattformübergreifende Bibliotheken.
4. **Keine erfundenen APIs.** Prüfe Versionsstände und tatsächliche API-Signaturen anhand der offiziellen Dokumentation.
5. **Schrittweise liefern.** Ein funktionierendes MVP hat Vorrang vor einer großen Menge unfertiger Features.
6. **Barrierefreiheit und Bedienbarkeit** auch bei ungewöhnlichen Skins berücksichtigen.

---

## 2. Verbindlicher Technologie-Stack

### Frontend

- Angular 22
- TypeScript mit strikten Compiler-Einstellungen
- Standalone Components
- Angular Signals für UI-Zustand
- `computed()` für abgeleitete Zustände
- `effect()` nur für echte Seiteneffekte, nicht als Ersatz für berechenbaren Zustand
- Zoneless Change Detection
- CSS Variables für Theme- und Skin-Werte
- moderne CSS-Techniken, möglichst ohne zusätzliche UI-Frameworks
- Angular CLI und den dazu passenden offiziellen Build-Prozess

Verwende keine NgModules, sofern sie nicht aus einem konkreten Kompatibilitätsgrund erforderlich sind. Vermeide unnötige RxJS-State-Architekturen. RxJS ist dort sinnvoll, wo Streams und asynchrone Ereignisverarbeitung tatsächlich Vorteile bieten.

### Desktop und Backend

- Tauri 2
- Rust
- Tauri Commands für gezielte Request/Response-Aufrufe
- Tauri Events für Statusänderungen und Benachrichtigungen
- SQLite für persistente Bibliotheks- und Anwendungsdaten, sofern benötigt
- JSON für portable Konfigurationen und Skin-Manifeste

### Audio

Prüfe die Eignung und aktuelle Wartung der folgenden Rust-Projekte, bevor du sie einsetzt:

- Symphonia für Audio-Decoding
- CPAL für Audio-Ausgabe
- Lofty für Audio-Metadaten und Tags

Lege die Bibliotheken nicht ungeprüft fest. Dokumentiere gegebenenfalls Alternativen, Lizenz, Plattformunterstützung und bekannte Einschränkungen.

---

## 3. Zielplattformen

Die Anwendung muss auf folgenden Plattformen funktionieren:

- Windows 10/11
- aktuelle unterstützte macOS-Versionen auf Apple Silicon und Intel, soweit die Toolchain dies ermöglicht
- gängige Linux-Distributionen

Berücksichtige plattformspezifische Unterschiede bei:

- Audio-Ausgabegeräten
- Dateisystempfaden
- globalen Medien-Tasten
- Tray-Integration
- Fensterverhalten und Fensterdekoration
- App-Daten- und Konfigurationsverzeichnissen
- Installer- und Paketformaten

Verwende keine plattformabhängigen Pfade oder Annahmen im gemeinsamen Anwendungscode. Kapsle Betriebssystembesonderheiten in Rust-Modulen.

---

## 4. Architektur

Entwirf eine klare Schichtenarchitektur.

### Angular Frontend

Verantwortlich für:

- Player-Oberfläche
- Playlist
- Musikbibliothek
- Skin-Auswahl und Skin-Vorschau
- Equalizer-Bedienoberfläche
- Visualisierungen
- Einstellungen
- Fensterinteraktionen
- Anzeige des Wiedergabestatus

### Tauri-Schicht

Verantwortlich für:

- IPC zwischen Angular und Rust
- Fensterverwaltung
- Datei- und Verzeichnisauswahl
- Drag & Drop von Dateien
- Betriebssystemintegration
- globale Tastenkürzel und Medien-Tasten, soweit plattformübergreifend zuverlässig möglich
- App-Lifecycle

### Rust-Kern

Verantwortlich für:

- Audio-Engine
- Wiedergabezustand
- Decoder
- Audio-Ausgabe
- Lautstärke und Balance
- Equalizer und DSP
- Playlist- und Queue-Logik
- Metadaten
- Musikbibliothek
- Dateisystemoperationen
- Persistenz
- Validierung und Laden von Skins

### Architekturregel

Der Rust-Kern darf keine Angular- oder WebView-Abhängigkeit besitzen. Die Audio-Engine muss auch ohne geöffnete Player-Oberfläche weiterlaufen können.

Erstelle eine Architekturübersicht und dokumentiere die Datenflüsse zwischen den Schichten.

---

## 5. Audio-Engine

Die Audio-Engine ist ein zentraler Bestandteil des Produkts.

### MVP-Funktionen

- Dateien öffnen und abspielen
- Play, Pause, Stop
- Next und Previous
- Seek / Position setzen
- Lautstärke
- Wiedergabestatus abfragen
- Trackdauer und aktuelle Position
- Fehlerbehandlung bei beschädigten oder nicht unterstützten Dateien
- Wechsel zwischen Tracks
- Wiedergabe unabhängig vom Zustand der Angular-WebView

### Audioformate

Untersuche und implementiere nach Möglichkeit Unterstützung für:

- MP3
- FLAC
- WAV
- Ogg Vorbis
- Opus
- AAC / M4A
- AIFF

Kennzeichne Formate, deren Unterstützung von optionalen Features, Lizenzfragen oder Plattformbibliotheken abhängt. Behaupte keine Formatunterstützung, bevor sie getestet wurde.

### Audio-Architektur

- Dedizierter Audio-Playback-Thread beziehungsweise eine geeignete Echtzeit-Architektur
- Nachrichtenqueue für Play, Pause, Seek, Stop, Volume und Trackwechsel
- Keine blockierenden Datei- oder Netzwerkoperationen im Audio-Callback
- Keine unnötigen Speicherallokationen im Echtzeit-Audio-Pfad
- definierte Fehler- und Wiederherstellungsstrategie
- sauberer Umgang mit Audio-Ausgabegerätewechseln
- Gapless Playback als spätere Ausbaustufe

Die UI soll keine hochfrequenten Audio-Daten über IPC transportieren. Übertrage nur die nötigen Statusinformationen. Für Visualisierungen sollen reduzierte, zeitlich begrenzte Analysewerte verwendet werden.

---

## 6. Skin-System

Das Skin-System ist das wichtigste Differenzierungsmerkmal.

### Anforderungen

Ein Skin soll nicht nur Farben ändern. Er soll – innerhalb eines klar definierten und sicheren Modells – folgende Eigenschaften beeinflussen können:

- Fenstergrößen und Fensterlayouts
- Hintergrundgrafiken
- Buttons und Zustände
- Typografie
- Farben und Rahmen
- Playlist-Darstellung
- Equalizer-Darstellung
- Bedienelemente und deren Positionierung
- optionale UI-Bereiche
- Fensteranordnung und Sichtbarkeit

### Eigenes Skin-Format

Entwirf ein versioniertes Skin-Format, das mindestens Folgendes unterstützt:

- `skin.json` als Manifest
- Name, Version, Autor und Beschreibung
- Vorschaubild
- Assets wie PNG, JPEG, SVG oder WebP, soweit sicher und sinnvoll
- definierte Fenster und Komponenten
- CSS-Variablen
- Layoutdefinitionen
- definierte Zustände für Bedienelemente
- Mindestversion der Anwendung
- Validierung und Fehlerdiagnose

Beispiel für ein Manifest:

```json
{
  "formatVersion": 1,
  "name": "Cyberpunk",
  "version": "1.0.0",
  "author": "Community",
  "description": "Dark futuristic player skin",
  "preview": "preview.png",
  "windows": {
    "player": {
      "width": 420,
      "height": 180,
      "background": "assets/player-background.png"
    }
  },
  "theme": {
    "accent": "#ffdd00",
    "background": "#141414",
    "foreground": "#f5f5f5"
  }
}
```

Dies ist nur ein Ausgangspunkt. Entwickle ein konsistentes Schema mit Versionierung und Validierung.

### Sicherheit

- Skins dürfen nicht beliebigen ausführbaren Code laden.
- Keine ungeprüften JavaScript-Skripte aus Skin-Paketen ausführen.
- Asset-Pfade gegen Path Traversal absichern.
- ZIP-Import gegen Zip-Slip, übergroße Dateien und Dekompressionsbomben absichern.
- erlaubte Dateitypen und Größen begrenzen.
- ungültige Skins dürfen die Anwendung nicht zum Absturz bringen.
- Skin-Wechsel muss ohne Neustart möglich sein.

### Winamp-Kompatibilität

Untersuche die technische Machbarkeit des Imports klassischer Winamp-2-Skins (`.wsz`). Diese sind ZIP-basierte Pakete mit einer historischen Skin-Struktur.

Implementiere die Kompatibilität nicht als unkontrolliertes Nebenprojekt. Beginne mit einer Analyse:

1. Dateiaufbau und Ressourcen der `.wsz`-Pakete verstehen.
2. Unterstützte Grafiken, Sprites und Zustände dokumentieren.
3. Mapping der klassischen Skin-Elemente auf die eigene Komponentenarchitektur definieren.
4. Grenzen der Kompatibilität transparent dokumentieren.
5. Erst danach einen inkrementellen Importer entwickeln.

Ziel ist eine möglichst gute Kompatibilität, nicht das Versprechen, jeden Skin pixelgenau darstellen zu können.

Beachte die Lizenzbedingungen von Webamp und anderen Referenzimplementierungen. Übernimm keinen fremden Code oder fremde Skins ohne Prüfung der jeweiligen Lizenz und Rechte.

---

## 7. Fensterkonzept

Orientiere dich an der klassischen Mehrfenster-Bedienung:

- Main Player
- Playlist
- Equalizer
- Visualizer
- Media Library
- Skin Browser

Die Fenster sollen:

- unabhängig verschiebbar sein
- separat ein- und ausgeblendet werden können
- ihre Position und Größe speichern
- nach einem Neustart sinnvoll wiederhergestellt werden
- über eine gemeinsame Anwendungszustandsverwaltung synchron bleiben

Prüfe die Grenzen von Tauri 2 bei mehreren WebView-Fenstern und die Auswirkungen auf Performance und Synchronisation.

Die Audio-Engine bleibt zentral im Rust-Prozess. Nicht jedes Fenster darf eine eigene Audio-Engine starten.

---

## 8. Angular-State-Architektur

Definiere einen klaren, typisierten Zustand.

Mögliche Zustandsbereiche:

```text
PlayerState
  currentTrack
  playbackStatus
  currentTime
  duration
  volume
  isMuted
  repeatMode
  shuffleEnabled

PlaylistState
  tracks
  currentIndex
  selectedTrackIds
  sortMode

LibraryState
  folders
  tracks
  searchQuery
  scanStatus

SkinState
  activeSkin
  availableSkins
  loadingStatus

WindowState
  visibleWindows
  windowLayouts

EqualizerState
  enabled
  bands
  presets
```

Verwende Signals für den lokalen und anwendungsweiten UI-Zustand. Trenne Backend-Zustand und UI-Zustand sauber. Das Frontend soll den tatsächlichen Wiedergabestatus aus Rust übernehmen und nicht unabhängig einen widersprüchlichen Zustand simulieren.

Definiere:

- Typen und Interfaces
- Services für Tauri-Kommunikation
- Signal-basierte Facades oder Stores
- Fehlerzustände
- Initialisierung und Wiederherstellung
- Event-Abonnements und deren Cleanup

Vermeide einen einzigen riesigen globalen Store.

---

## 9. MVP-Umfang

Implementiere zuerst nur einen stabilen, testbaren Kern.

### Muss-Funktionen

1. Desktop-Anwendung startet auf Windows, macOS und Linux.
2. Audio-Dateien können über Datei-Dialog geöffnet werden.
3. Audio-Dateien können per Drag & Drop hinzugefügt werden.
4. Eine Playlist zeigt Titel, Interpret und Dauer, sofern verfügbar.
5. Play, Pause, Stop, Next und Previous funktionieren.
6. Seekbar und Lautstärke funktionieren.
7. Ein Track kann wiederholt und die Playlist abgespielt werden.
8. Die Wiedergabe läuft weiter, wenn ein UI-Fenster geschlossen oder neu geladen wird.
9. Mindestens zwei mitgelieferte Skins sind vorhanden:
    - klassischer Retro-/Winamp-inspirierter Skin
    - moderner dunkler Skin
10. Skins können zur Laufzeit gewechselt werden.
11. Einstellungen und Playlist können gespeichert und wiederhergestellt werden.
12. Fehler werden verständlich angezeigt und protokolliert.

### Bewusst später

- vollständige `.wsz`-Kompatibilität
- MilkDrop-Kompatibilität
- Plugin-Marktplatz
- Streamingdienste
- Online-Musikdienste
- komplexer Skin-Editor
- Synchronisation zwischen Geräten
- umfangreiche Tag-Bearbeitung

Diese Funktionen dürfen die Architektur vorbereiten, aber nicht die Fertigstellung des MVP blockieren.

---

## 10. UI- und UX-Anforderungen

Die Anwendung soll bewusst eine eigenständige Identität besitzen.

### Grunddesign

- dunkles neutrales Basisthema
- klare Typografie
- kompakte Player-Bedienelemente
- präzise Abstände
- gute Lesbarkeit
- skalierbare Fenster
- keine überladenen Standard-Dashboard-Karten
- keine unnötigen Animationen
- sinnvolle Tastaturbedienung

Der Retro-Skin darf bewusst pixelig und nostalgisch aussehen. Der moderne Skin soll dagegen wie eine hochwertige aktuelle Desktop-Anwendung wirken.

### CSS-Architektur

Nutze CSS Custom Properties für alle skinrelevanten Werte, beispielsweise:

```css
:root {
  --player-background: #141414;
  --player-foreground: #f5f5f5;
  --player-accent: #ffdd00;
  --player-border: #333333;
  --player-font-family: system-ui, sans-serif;
  --player-radius: 6px;
}
```

Verwende semantische Variablennamen. Vermeide fest codierte Skin-Farben in Angular-Komponenten.

### Responsive Verhalten

Auch wenn es sich um eine Desktop-Anwendung handelt, müssen Fenstergrößen berücksichtigt werden. Definiere Mindestgrößen und sinnvolle Layoutanpassungen.

---

## 11. Persistenz und Musikbibliothek

Entwickle ein robustes Konzept für:

- zuletzt geöffnete Dateien
- Playlists
- Wiedergabeposition, sofern sinnvoll
- Lautstärke und Wiedergabeeinstellungen
- aktive Skins
- Fensterpositionen
- Musikbibliotheksordner
- Metadaten und Albumcover-Cache

Nutze SQLite nur für strukturierte, durchsuchbare Daten. Kleine Einstellungen können in einer versionierten Konfigurationsdatei gespeichert werden.

Berücksichtige:

- verschobene oder gelöschte Dateien
- nicht verfügbare externe Laufwerke
- doppelte Tracks
- große Musikbibliotheken
- inkrementelles Scannen
- Abbruch und Fortsetzung eines Bibliotheksscans

---

## 12. Qualitätssicherung

Erstelle Tests auf mehreren Ebenen.

### Rust

- Unit-Tests für Wiedergabezustandsmaschine
- Tests für Playlist-Operationen
- Tests für Skin-Manifest-Validierung
- Tests für Pfad- und Archivvalidierung
- Tests für Metadaten
- Tests für Fehlerfälle der Audio-Engine, soweit automatisierbar

### Angular

- Tests für Signal-basierte Zustandslogik
- Tests für Player-Bedienelemente
- Tests für Skin-Wechsel
- Tests für Fehler- und Ladezustände
- Tests für die Tauri-Service-Abstraktionen mit Mock-Backend

### Integration

- Start und Beenden
- Datei öffnen
- Track abspielen und pausieren
- Trackwechsel
- Seek
- Skin-Wechsel
- Wiederherstellung gespeicherter Einstellungen

Dokumentiere manuelle Tests, die wegen echter Audio-Hardware nicht zuverlässig automatisiert werden können.

---

## 13. Entwicklungsphasen und Arbeitsweise

Arbeite in klar abgegrenzten Phasen. Nach jeder Phase muss ein lauffähiger Zwischenstand existieren.

### Phase 0 – Technische Validierung

- aktuelle Versionen und Kompatibilität prüfen
- Angular 22 und Tauri 2 zusammenführen
- Rust-Audio-Bibliotheken evaluieren
- Audio-Ausgabe auf den drei Zielplattformen untersuchen
- Architekturentscheidungen dokumentieren
- Risiken und offene Fragen festhalten

Ergebnis: Architekturentscheidung und minimales lauffähiges Grundgerüst.

### Phase 1 – Projektgerüst

- Angular-App
- Tauri-2-App
- Rust-Core
- IPC-Abstraktion
- Logging
- Fehlerbehandlung
- CI-Grundlage

Ergebnis: Startfähige Desktop-App auf den verfügbaren Entwicklungsplattformen.

### Phase 2 – Audio-MVP

- Audio-Datei öffnen
- Decoding
- Ausgabe
- Play/Pause/Stop
- Seek
- Lautstärke
- Wiedergabestatus an Angular übertragen

Ergebnis: Ein stabiler Player mit einer einfachen Oberfläche.

### Phase 3 – Playlist und Persistenz

- Playlist
- Track-Metadaten
- Dateiauswahl und Drag & Drop
- Speichern und Wiederherstellen
- Fehlerbehandlung bei fehlenden Dateien

### Phase 4 – Skin Engine

- Manifest-Schema
- Skin-Loader
- Asset-Verwaltung
- CSS-Variablen
- Skin-Wechsel zur Laufzeit
- Retro-Skin
- moderner Skin
- Skin-Validierung

### Phase 5 – Mehrfenster-Architektur

- Player-Fenster
- Playlist-Fenster
- Equalizer-Fenster
- Fensterzustände
- Synchronisation

### Phase 6 – Advanced Audio

- Equalizer
- DSP
- Spektrumanalyse
- Visualizer
- Gapless Playback

### Phase 7 – Community und Kompatibilität

- `.wsz`-Importer
- Skin-Browser
- Skin-Export
- Skin-Dokumentation
- gegebenenfalls Plugin-API

---

## 14. Projektstruktur

Entwirf eine verständliche Struktur. Ein möglicher Ausgangspunkt:

```text
FLAC Commander/
  src/
    app/
      core/
        audio/
        tauri/
        state/
      features/
        player/
        playlist/
        library/
        equalizer/
        visualizer/
        skins/
        settings/
      shared/
      styles/
  src-tauri/
    src/
      audio/
      commands/
      events/
      library/
      metadata/
      playlist/
      skins/
      storage/
      platform/
    capabilities/
    Cargo.toml
  skins/
    classic/
    modern/
  docs/
    architecture/
    decisions/
    skin-format/
  scripts/
```

Passe die Struktur an die tatsächlichen Anforderungen an. Vermeide künstliche Abstraktionen und zu viele kleine Dateien ohne Mehrwert.

---

## 15. Dokumentation

Erstelle mindestens:

- `README.md` – Projekt, Features, Voraussetzungen und Start
- `ARCHITECTURE.md` – Schichten und Datenflüsse
- `DEVELOPMENT.md` – lokale Entwicklung und Build
- `AUDIO-ENGINE.md` – Audio-Architektur und Threading
- `SKIN-FORMAT.md` – Skin-Manifest und Assets
- `ROADMAP.md` – Entwicklungsphasen
- `SECURITY.md` – Skin-Import und Sicherheitsmodell
- `LICENSE` – erst nach bewusster Entscheidung für eine passende Open-Source-Lizenz

Dokumentiere wichtige Architekturentscheidungen als kurze ADRs (Architecture Decision Records).

---

## 16. Konkreter Arbeitsauftrag an den Coding-Agent

Beginne nicht damit, sofort das gesamte Produkt zu programmieren.

Gehe folgendermaßen vor:

1. Untersuche das vorhandene Repository und die Entwicklungsumgebung.
2. Prüfe die aktuellen offiziellen Dokumentationen und Paketversionen.
3. Erstelle eine Liste technischer Risiken und offener Entscheidungen.
4. Erstelle einen konkreten Implementierungsplan mit überprüfbaren Meilensteinen.
5. Lege die Projektstruktur an.
6. Implementiere ausschließlich Phase 0 und Phase 1.
7. Führe Builds und Tests aus.
8. Behebe Fehler, bevor du die nächste Phase beginnst.
9. Dokumentiere, was tatsächlich funktioniert und was noch nicht implementiert ist.

Falls das Repository bereits Code enthält, analysiere ihn zuerst und überschreibe keine bestehenden Funktionen ohne Notwendigkeit.

### Anforderungen an jede Änderung

- produktionsorientierter, sauber typisierter Code
- keine unnötigen Abhängigkeiten
- keine Platzhalter, die als fertige Funktion ausgegeben werden
- keine simulierte Audio-Wiedergabe
- keine stillschweigend verschluckten Fehler
- nachvollziehbare Fehlerbehandlung
- Tests für relevante Logik
- Formatierung und Linting
- keine unnötigen Architekturkomplexitäten

### Abschlussbericht

Melde nach jedem Meilenstein:

- welche Dateien angelegt oder geändert wurden
- welche Funktionen implementiert wurden
- welche Builds und Tests erfolgreich waren
- welche Tests noch fehlen
- welche technischen Probleme bestehen
- welcher konkrete nächste Schritt folgt

**Wichtig:** Implementiere nicht alle Phasen auf einmal. Liefere zuerst ein stabiles Fundament und eine nachweislich funktionierende Audio-Wiedergabe.
