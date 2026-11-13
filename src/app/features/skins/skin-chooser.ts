import { Component, computed, effect, ElementRef, inject, viewChild } from '@angular/core';
import { describeError } from '../../core/errors/app-error';
import { SkinStore } from './skin.store';
import { SKINS_TEXTS } from './skins-texts';

/** The dialog to choose, import and remove skins. Looks the same in every skin's colours. */
@Component({
  selector: 'app-skin-chooser',
  templateUrl: './skin-chooser.html',
  styleUrl: './skin-chooser.css',
})
export class SkinChooser {
  protected readonly store = inject(SkinStore);
  protected readonly t = SKINS_TEXTS;

  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

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
      const open = this.store.chooserOpen();
      if (open && !dialog.open) {
        dialog.showModal?.();
      } else if (!open && dialog.open) {
        dialog.close();
      }
    });
  }
}
