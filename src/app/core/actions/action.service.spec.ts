import { ActionService } from './action.service';
import { describeShortcut, elementHandlesKey, matches } from './shortcut';

function key(key: string, init: KeyboardEventInit = {}, target?: HTMLElement): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
  if (target) {
    document.body.append(target);
    target.dispatchEvent(event);
    target.remove();
  }
  return event;
}

describe('shortcuts', () => {
  it('match the key without other modifiers', () => {
    expect(matches({ key: ' ' }, key(' '))).toBe(true);
    expect(matches({ key: 'v' }, key('V'))).toBe(true);
    expect(matches({ key: 'v' }, key('v', { altKey: true }))).toBe(false);
    expect(matches({ key: 'ArrowLeft' }, key('ArrowLeft'))).toBe(true);
    expect(matches({ key: 'ArrowLeft' }, key('ArrowRight'))).toBe(false);
  });

  it('use ⌘ on macOS and Ctrl elsewhere as the command modifier', () => {
    const open = { key: 'o', mod: true };
    expect(matches(open, key('o', { metaKey: true }), true)).toBe(true);
    expect(matches(open, key('o', { ctrlKey: true }), true)).toBe(false);
    expect(matches(open, key('o', { ctrlKey: true }), false)).toBe(true);
    expect(matches(open, key('o'), false)).toBe(false);
    expect(matches({ key: 'o' }, key('o', { ctrlKey: true }), false)).toBe(false);
  });

  it('are described the way the platform writes them', () => {
    expect(describeShortcut({ key: ' ' })).toBe('Space');
    expect(describeShortcut({ key: 'ArrowLeft' })).toBe('←');
    expect(describeShortcut({ key: 'v' })).toBe('V');
    expect(describeShortcut({ key: 'o', mod: true }, true)).toBe('⌘O');
    expect(describeShortcut({ key: 'o', mod: true }, false)).toBe('Ctrl+O');
  });

  it('leave keys to the focused element that needs them', () => {
    const button = document.createElement('button');
    const range = Object.assign(document.createElement('input'), { type: 'range' });
    const text = Object.assign(document.createElement('input'), { type: 'text' });
    const div = document.createElement('div');

    expect(elementHandlesKey(button, key(' '))).toBe(true);
    expect(elementHandlesKey(button, key('Enter'))).toBe(true);
    expect(elementHandlesKey(button, key('ArrowLeft'))).toBe(false);
    expect(elementHandlesKey(range, key('ArrowLeft'))).toBe(true);
    expect(elementHandlesKey(range, key(' '))).toBe(false);
    expect(elementHandlesKey(text, key('v'))).toBe(true);
    expect(elementHandlesKey(text, key('o', { metaKey: true }))).toBe(false);
    expect(elementHandlesKey(div, key(' '))).toBe(false);
    expect(elementHandlesKey(null, key(' '))).toBe(false);
  });
});

describe('ActionService', () => {
  let service: ActionService;
  let ran: string[];
  let enabled: boolean;

  beforeEach(() => {
    service = new ActionService();
    ran = [];
    enabled = true;
    service.register([
      { id: 'toggle', label: () => 'Play', shortcut: { key: ' ' }, run: () => ran.push('toggle') },
      {
        id: 'stop',
        label: () => 'Stop',
        shortcut: { key: 'v' },
        enabled: () => enabled,
        run: () => ran.push('stop'),
      },
      { id: 'plain', label: () => 'No key', run: () => ran.push('plain') },
    ]);
  });

  it('runs the action of a key and keeps the key from the page', () => {
    const event = key(' ', {}, document.createElement('div'));
    expect(service.handleKey(event)).toBe(true);
    expect(ran).toEqual(['toggle']);
    expect(event.defaultPrevented).toBe(true);
  });

  it('ignores keys nobody registered', () => {
    const event = key('q', {}, document.createElement('div'));
    expect(service.handleKey(event)).toBe(false);
    expect(event.defaultPrevented).toBe(false);
    expect(ran).toEqual([]);
  });

  it('does not run a disabled action, by key or by id', () => {
    enabled = false;
    expect(service.handleKey(key('v', {}, document.createElement('div')))).toBe(false);
    expect(service.run('stop')).toBe(false);
    expect(ran).toEqual([]);
    enabled = true;
    expect(service.run('stop')).toBe(true);
    expect(ran).toEqual(['stop']);
  });

  it("leaves Space to a focused button: the click is the button's own business", () => {
    const event = key(' ', {}, document.createElement('button'));
    expect(service.handleKey(event)).toBe(false);
    expect(ran).toEqual([]);
    expect(event.defaultPrevented).toBe(false);
  });

  it('leaves a key alone that someone else has handled', () => {
    const event = key(' ');
    event.preventDefault();
    expect(service.handleKey(event)).toBe(false);
  });

  it('gives tooltips the label with the shortcut', () => {
    expect(service.hint('toggle')).toBe('Play (Space)');
    expect(service.hint('plain')).toBe('No key');
    expect(service.hint('unknown')).toBe('');
  });

  it('removes actions again and refuses a second registration of an id', () => {
    const remove = service.register([{ id: 'temp', label: () => 'T', run: () => ran.push('t') }]);
    expect(() => service.register([{ id: 'temp', label: () => 'T', run: () => 0 }])).toThrow();
    remove();
    expect(service.run('temp')).toBe(false);
  });
});
