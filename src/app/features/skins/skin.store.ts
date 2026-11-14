import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';
import { untilDestroyed } from '../../core/backend/events';
import { AppError, toAppError } from '../../core/errors/app-error';
import { LogApi } from '../../core/log/log-api';
import { SkinApi } from '../../core/skins/skin-api';
import { ActiveSkin, sizeRange, SkinInfo } from '../../core/skins/skin.models';
import { SKINS_TEXTS } from './skins-texts';
import { applyTheme } from './theme';

/** How often the window size is corrected for one skin (against a ping-pong with the system). */
const MAX_FIT_ATTEMPTS = 3;

/** Id of the skin every installation has (`DEFAULT_SKIN` in fc-core). */
const LIST_HIDDEN_KEY = 'fc.listHidden';

function storedListHidden(): boolean {
  try {
    return localStorage.getItem(LIST_HIDDEN_KEY) === '1';
  } catch {
    return false;
  }
}

export const DEFAULT_SKIN_ID = 'io.github.krocon.vinyl';

/**
 * The active skin of this window and the list to choose from. The backend decides which skin is
 * active (for all windows); this store applies its theme to the document.
 */
@Injectable({ providedIn: 'root' })
export class SkinStore {
  private readonly api = inject(SkinApi);
  private readonly log = inject(LogApi);

  private readonly activeState = signal<ActiveSkin | null>(null);
  private readonly listState = signal<readonly SkinInfo[]>([]);
  private readonly errorState = signal<AppError | null>(null);
  private readonly noticeState = signal<string | null>(null);
  private readonly chooserOpenState = signal(false);
  private readonly listHiddenState = signal(storedListHidden());
  /** What the backend knows about the list (it starts with a list): told when that changes. */
  private listAwayTold = false;
  private activeReceived = false;
  /** Corrections of the window size asked for since the skin became active. */
  private fitAttempts = 0;

  readonly active = this.activeState.asReadonly();
  readonly list = this.listState.asReadonly();
  readonly error = this.errorState.asReadonly();
  /** A success worth telling (a skin was installed). */
  readonly notice = this.noticeState.asReadonly();
  readonly chooserOpen = this.chooserOpenState.asReadonly();
  readonly activeId = computed(() => this.activeState()?.info.id ?? null);
  /** The player of an `absolute` skin; `null`: the app lays out its standard player. */
  readonly absolutePlayer = computed(() => {
    const player = this.activeState()?.player;
    return player?.layout === 'absolute' ? player : null;
  });

  readonly ready: Promise<void>;

  constructor() {
    this.ready = this.connect(inject(DestroyRef));
  }

  private async connect(destroyRef: DestroyRef): Promise<void> {
    try {
      await untilDestroyed(
        this.api.onActive((skin) => this.apply(skin)),
        destroyRef,
      );
      const active = await this.api.active();
      if (!this.activeReceived) {
        this.apply(active);
      }
    } catch (e) {
      this.fail('skins_active', e);
    }
  }

  /** The user has hidden the track list of the main window. Kept between starts. */
  readonly listHidden = this.listHiddenState.asReadonly();

  toggleList(): void {
    const hidden = !this.listHiddenState();
    this.listHiddenState.set(hidden);
    try {
      localStorage.setItem(LIST_HIDDEN_KEY, hidden ? '1' : '0');
    } catch {
      // no storage: the choice lasts until the app is closed
    }
  }

  /**
   * The main window shows no track list (hidden, or in a window of its own): the backend
   * gives a skin that has a height for that its shorter window.
   */
  tellListAway(away: boolean): void {
    if (this.listAwayTold === away) {
      return;
    }
    this.listAwayTold = away;
    this.fitAttempts = 0;
    void this.send('skins_set_list_hidden', () => this.api.setListHidden(away));
  }

  /** Address of a picture of the active skin. */
  assetUrl(path: string): string {
    const id = this.activeId();
    return id ? this.api.assetUrl(id, path) : '';
  }

  /** Address of the preview of any installed skin. */
  previewUrl(skin: SkinInfo): string | null {
    return skin.preview ? this.api.assetUrl(skin.id, skin.preview) : null;
  }

  async openChooser(): Promise<void> {
    this.errorState.set(null);
    this.noticeState.set(null);
    this.chooserOpenState.set(true);
    await this.refresh();
  }

  closeChooser(): void {
    this.chooserOpenState.set(false);
  }

  async refresh(): Promise<void> {
    try {
      this.listState.set(await this.api.list());
    } catch (e) {
      this.fail('skins_list', e);
    }
  }

  activate(id: string): Promise<void> {
    return this.send('skins_activate', () => this.api.activate(id));
  }

  /** The way out of any skin, bound to a key that no skin can take away. */
  reset(): Promise<void> {
    return this.activate(DEFAULT_SKIN_ID);
  }

  async import(): Promise<void> {
    this.noticeState.set(null);
    await this.send('skins_import', async () => {
      const installed = await this.api.import(SKINS_TEXTS.importDialogTitle);
      if (installed) {
        this.noticeState.set(SKINS_TEXTS.imported(installed.name));
        await this.refresh();
      }
    });
  }

  /** Saves a skin as an archive that can be passed on. */
  async export(skin: SkinInfo): Promise<void> {
    this.noticeState.set(null);
    await this.send('skins_export', async () => {
      if (await this.api.export(skin.id, SKINS_TEXTS.exportDialogTitle)) {
        this.noticeState.set(SKINS_TEXTS.exported(skin.name));
      }
    });
  }

  async remove(id: string): Promise<void> {
    await this.send('skins_remove', () => this.api.remove(id));
    await this.refresh();
  }

  /**
   * The window of a fixed-size skin has the size the skin asks for – if not (a title bar took
   * its share), the backend is told the real size and corrects the window. Called when the
   * skin changes and when the window is resized; a few tries, then it is left as it is.
   */
  fitWindow(viewportWidth: number, viewportHeight: number, listAway = false): void {
    const player = this.absolutePlayer();
    if (!player || player.width === null || player.height === null) {
      return;
    }
    // any size the skin's rules for resizing allow is fine
    const { min, max } = sizeRange(player, listAway);
    const fits = (now: number, axis: 0 | 1) => now >= min[axis] && now <= max[axis];
    if (fits(viewportWidth, 0) && fits(viewportHeight, 1)) {
      return;
    }
    if (this.fitAttempts >= MAX_FIT_ATTEMPTS) {
      return;
    }
    this.fitAttempts++;
    void this.send('skins_fit_viewport', () => this.api.fitViewport(viewportWidth, viewportHeight));
  }

  private apply(skin: ActiveSkin): void {
    this.activeReceived = true;
    this.fitAttempts = 0;
    this.activeState.set(skin);
    if (typeof document !== 'undefined') {
      applyTheme(document.documentElement, skin.theme);
    }
  }

  private async send(command: string, run: () => Promise<unknown>): Promise<void> {
    try {
      await run();
      this.errorState.set(null);
    } catch (e) {
      this.fail(command, e);
    }
  }

  private fail(command: string, e: unknown): void {
    const error = toAppError(e);
    this.log.error(`${command} failed: ${error.code}: ${error.message}`);
    this.errorState.set(error);
  }
}
