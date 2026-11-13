import {
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { describeError } from '../../core/errors/app-error';
import { WindowsStore } from '../windows/windows.store';
import { SkinStore } from './skin.store';
import { SKINS_TEXTS } from './skins-texts';

/**
 * Where skins are chosen, imported and removed. In the main window it is a dialog; with `page`
 * it fills a window of its own. Looks the same in every skin's colours.
 */
@Component({
  selector: 'app-skin-chooser',
  templateUrl: './skin-chooser.html',
  styleUrl: './skin-chooser.css',
  host: {
    '[class.page]': 'page()',
    // the window is only hidden between uses: what it shows may be old
    '(window:focus)': 'page() && store.refresh()',
  },
})
export class SkinChooser {
  /** Fills its window instead of lying over the player. */
  readonly page = input(false);

  protected readonly store = inject(SkinStore);
  private readonly windows = inject(WindowsStore);
  protected readonly t = SKINS_TEXTS;

  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  /** What the user typed to narrow the list down. */
  protected readonly query = signal('');
  /** The skins whose name, description or keywords contain every word typed. */
  protected readonly shown = computed(() => {
    const words = this.query().toLowerCase().split(/\s+/).filter(Boolean);
    return this.store.list().filter((skin) => {
      const text = [skin.name, skin.description ?? '', ...(skin.keywords ?? [])]
        .join(' ')
        .toLowerCase();
      return words.every((word) => text.includes(word));
    });
  });

  protected readonly errorText = computed(() => {
    const error = this.store.error();
    if (!error) {
      return null;
    }
    return error.code === 'invalid_skin' ? this.t.refused : describeError(error);
  });
  /** What exactly is wrong with a refused skin, one line per problem. */
  protected readonly errorLines = computed(() => {
    const error = this.store.error();
    return error?.code === 'invalid_skin' ? (error.details?.split('\n') ?? []) : [];
  });

  constructor() {
    // the native dialog is opened and closed to follow the store
    effect(() => {
      const dialog = this.dialog().nativeElement;
      if (this.page()) {
        // always there, and not modal: the window is the frame
        if (!dialog.open) {
          dialog.show?.();
          void this.store.openChooser();
        }
        return;
      }
      const open = this.store.chooserOpen();
      if (open && !dialog.open) {
        dialog.showModal?.();
      } else if (!open && dialog.open) {
        dialog.close();
      }
    });
  }

  /** Choosing a skin is the end of choosing: the chooser goes away, unless it failed. */
  protected async use(id: string): Promise<void> {
    await this.store.activate(id);
    if (!this.store.error()) {
      this.close();
    }
  }

  protected close(): void {
    if (this.page()) {
      if (this.windows.skinsOpen()) {
        void this.windows.toggle('skins');
      }
    } else {
      this.store.closeChooser();
    }
  }
}
