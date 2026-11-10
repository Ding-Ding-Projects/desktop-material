# Motion settings / 動態設定

Motion is an appearance value. A person chooses a level, a speed and which
surfaces animate, and the calmer of that choice and the operating system's
reduced-motion setting always wins.

動態效果係一個外觀數值：自己揀程度、速度同邊啲版面郁。你揀嘅設定同作業系統嘅
「減少動態」邊個靜啲就聽邊個。

## Behaviour

Open the app workspace appearance editor (right-click the workspace, **Edit app
workspace appearance…**).

| Control | Values | Effect |
| --- | --- | --- |
| Animation | Follow system setting, Full motion, Calm motion, Reduce motion | The level. Calm shortens every animation; Reduce makes changes instant. |
| Animation speed | 0.5x to 2x in steps of 0.1, with **Reset speed** | Divides every duration. Disabled, with the reason shown, while motion is reduced. |
| Animate these surfaces | Dialogs and popovers, Lists, Tabs, Charts, Celebrations | A surface that is switched off changes instantly. |

Reduce motion and the system setting always win over the speed and the surface
switches: a speed of 2x never turns motion back on.

## How it is applied

- `app/src/models/motion-settings.ts` normalizes stored values and resolves the
  level and the durations.
- `app/src/ui/lib/motion-runtime.ts` writes `data-dm-motion`,
  `data-dm-motion-preference`, `data-dm-motion-off` and the `--dm-motion-short`,
  `--dm-motion-medium` and `--dm-motion-long` durations on `<body>`.
- `app/styles/material/_transitions.scss` points the Material duration tokens at
  those durations and gives each switched-off surface an instant path. It adds
  no animation and restyles nothing.
- Charts and celebrations that animate from script ask `isMotionEnabledFor`.

## Motion polish on existing controls (November 9, 2026)

`app/styles/material/_polish.scss` applies the motion language of the design
pass to controls the app already has. At the full and calm levels:

- buttons ease their colour and elevation, and a press settles with a small
  spring;
- list rows, toolbar buttons, menu rows and links fade between states;
- text fields, selects, check boxes and radio buttons ease their focus and
  checked treatments;
- popovers fade in (opacity only, so their position is untouched).

It adds no control and changes no colour, size or layout at rest. Reduce
motion, the system setting and a switched-off surface all still win.

## Configuration

The values are stored with the rest of the appearance customization
(`motion`, `motionSpeed`, `motionSurfaces`), so they are saved, restored from
appearance history and reset the same way as the accent colour.

## Failure modes

- A stored speed that is not a number, or is outside 0.5 to 2, falls back to the
  nearest valid step or to 1x.
- Unknown surface names are ignored and missing ones default to on.
- Reduced durations are 1 ms rather than 0, so code waiting for `transitionend`
  or `animationend` still continues.

## Security considerations

None. The values are local appearance settings and are not sent anywhere.

## Verification

- `app/test/unit/motion-settings-test.ts` (normalization, level resolution,
  durations)
- `app/test/unit/motion-runtime-test.ts` (body attributes and properties,
  switched-off surfaces, clearing)
- `app/test/unit/motion-transitions-style-test.ts` (import order, token mapping,
  one instant path per surface)
- `app/test/unit/ui/element-appearance-editors-test.tsx` (speed, reset, surface
  switches, disabled state)

- `app/test/unit/motion-polish-style-test.ts` (scoping, no change at rest,
  resolved durations)

All 23 tests pass on Linux as of 2026-11-09. The polish stylesheet was also
loaded into release v4.0.139501 running under Linux with stand-ins for the
Windows-only modules, where Settings opened and laid out as before; that is a
sanity check, not a capture of a Windows build. The built Windows application has
not been checked and no capture exists yet.
