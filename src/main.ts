import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { setLanguage, systemLanguage } from './app/core/i18n/i18n';

setLanguage(systemLanguage());
bootstrapApplication(App, appConfig).catch((err) => console.error(err));
