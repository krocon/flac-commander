import { ApplicationConfig, ErrorHandler, provideBrowserGlobalErrorListeners } from '@angular/core';
import { LogApi, TauriLogApi } from './core/log/log-api';
import { LoggingErrorHandler } from './core/log/logging-error-handler';
import { PlayerApi, TauriPlayerApi } from './core/player/player-api';
import { PlaylistApi, TauriPlaylistApi } from './core/playlist/playlist-api';
import { SystemApi, TauriSystemApi } from './core/system/system-api';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    { provide: ErrorHandler, useClass: LoggingErrorHandler },
    { provide: LogApi, useClass: TauriLogApi },
    { provide: SystemApi, useClass: TauriSystemApi },
    { provide: PlayerApi, useClass: TauriPlayerApi },
    { provide: PlaylistApi, useClass: TauriPlaylistApi },
  ],
};
