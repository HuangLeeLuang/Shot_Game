# 射擊遊戲 Specification

## 1. Project Goal

Create a browser-based first-person shooting game where the player does not move. The core interaction is aiming, shooting, aiming down sights, reloading, weapon selection, and weapon customization.

Working title: 射擊遊戲.

The game should support both desktop and mobile:

- Desktop: mouse aim, left click shoot, right click aim down sights, `R` reload.
- Mobile: landscape-first experience, touch aim by default, optional gyroscope aiming, touch buttons for shoot / aim / reload / gyro / pause.

The first implementation phase prioritizes complete playable flow over polished art.

## 2. Technical Direction

- Stack: plain `HTML`, `CSS`, `JavaScript`, and `Canvas`.
- No frontend framework in the first version.
- Game can run as a static web page.
- Visual style: 2.5D / pseudo-3D.
- Rendering approach:
  - Canvas-drawn perspective backgrounds.
  - 2D target sprites scaled by distance.
  - Depth cues through scale, darkness, blur-like treatment, and motion speed.
- Save system: browser `localStorage`.
- Offline play: PWA manifest plus service worker cache for the static app shell and bundled assets.
- UI language: Traditional Chinese and English, switchable.

## 3. Art And Audio Direction

### Theme

Modern military training facility, realistic but clean and non-gory.

### Stage Areas

All three levels are different areas inside the same training base:

1. Indoor target range.
2. Defense corridor.
3. Outdoor sniper range.

### UI Style

Modern range equipment:

- Clean dashboard feeling.
- Orange / white / gray palette.
- Practical training-terminal tone.
- Avoid overly dark tactical UI.

### Assets

- Use only CC0 / Public Domain assets.
- Free assets may be downloaded when implementation starts.
- Keep a source record for downloaded assets.
- First playable version should use CC0 / Public Domain assets where practical.
- Current target and weapon sprites should use realistic AI-generated raster assets with transparent backgrounds; simple placeholders are fallback only.

### Audio

Target audio scope:

- Different gunshot sounds per weapon.
- Empty gun click.
- Reload.
- Aim down sights.
- Hit / weakpoint hit.
- UI sounds.
- Level clear / failure.
- Simple background music or ambient training audio.

## 4. Game Flow

Main flow:

1. Main menu.
2. Mission setup screen.
3. Optional level tutorial or direct start.
4. Gameplay.
5. Result screen.
6. Retry or return to main menu.

### Main Menu

The main menu includes:

- Start.
- Test wall.
- Settings.
- Records.
- Language switch.

### Mission Setup Screen

The mission setup screen combines:

- Level selection.
- Difficulty selection.
- Weapon selection.
- Standard weapon or saved custom configuration selection.
- Optional weapon customization entry point.

After setup, the player can choose:

- View short tutorial.
- Start immediately.

### Tutorial

Use one short page with text and icons.

Tutorials are optional and can be skipped.

### Pause

Pause is required.

- Desktop: `Esc`.
- Mobile: pause button.
- Pause menu options:
  - Continue.
  - Retry.
  - Return to main menu.
  - Settings.

## 5. Levels

The first version contains three short levels. Each level should last about 1-2 minutes.

### Level 1: Indoor Target Range

- Goal: destroy 10 targets.
- Target behavior: random positions.
- No enemy attack.
- Pressure comes from accuracy, reaction time, and finite ammo.
- Fails if ammo is exhausted before all targets are cleared.

### Level 2: Defense Corridor

- Goal: stop 15 advancing enemies / targets.
- Targets move laterally and gradually approach the player.
- No player movement.
- Fails if:
  - Ammo is exhausted before all targets are cleared.
  - An enemy gets too close and breaks the defense line.

### Level 3: Outdoor Sniper Range

- Goal: clear 5 long-distance mission targets.
- Target types are mixed:
  - Stationary distant target.
  - Slow moving distant target.
  - Briefly appearing target.
- Newbie and standard difficulties: crosshair center hit rule.
- Expert difficulty: light wind drift / bullet drop applies to all weapons in this level.
- Expert wind drift / bullet drop should truly offset the hit point, but the UI must show the player where the shot is expected to land or what compensation point to use.

## 6. Difficulty

Three difficulty levels:

1. Newbie.
2. Standard.
3. Expert.

Difficulty affects:

- Target speed.
- Target exposure duration.
- Enemy advance speed in level 2.
- Ammo pressure.
- Rating thresholds.
- Expert-only wind drift / bullet drop in level 3.

## 7. Core Controls

### Desktop

- Crosshair must stay fixed at the center of the screen.
- Clicking the play area locks mouse focus to the game.
- Mouse movement changes the view direction / aim offset instead of moving the crosshair graphic.
- Left mouse button: shoot.
- Right mouse button: aim down sights.
- `R`: reload.
- `Esc`: pause.
- Keyboard bindings should be customizable in settings.

### Mobile

- Required orientation: landscape.
- If portrait orientation is detected, show rotate-device prompt.
- Default aiming: drag on the empty screen area.
- Optional gyroscope aiming, enabled by an on-screen button.
- Touch UI buttons:
  - Shoot.
  - Aim down sights.
  - Reload.
  - Gyroscope toggle.
  - Pause.
- Touch button positions are customizable.

### Aim Assist

No aim assist.

The crosshair shoots exactly where it is placed, subject only to weapon handling effects that move or destabilize the crosshair.

## 8. Weapon System

The player can choose a weapon before each level. The selected weapon applies only to that run.

Base weapons:

1. Pistol.
2. Rifle.
3. Sniper rifle.

Base balance:

- Pistol: easy to control, low firepower.
- Rifle: balanced.
- Sniper rifle: high damage, high magnification, slow fire rate and handling.

### Ammo

Ammo is semi-realistic:

- Magazine ammo is limited.
- Reserve ammo is limited.
- `R` reloads the magazine.
- If all ammo is exhausted before objectives are complete, the level fails.

### Weapon Handling

Weapon feel should be more realistic, but hit detection remains intuitive.

Handling variables include:

- Recoil.
- Spread / instability.
- Aim down sights speed.
- Reload speed.
- Fire rate.
- Magazine size.
- Reserve ammo.
- Magnification.
- Breath sway.
- Recovery after not firing.

## 9. Hit Detection

The rule is:

The shot hits if the crosshair center is on a valid target at the moment of firing.

However, the crosshair itself is affected by weapon handling:

- Recoil shifts the crosshair after firing.
- Spread / instability causes aim wobble or offset.
- Breath sway creates subtle rhythmic motion, especially while aiming down sights.
- Distance makes targets visually smaller and harder to keep under the crosshair.
- Aim down sights improves stability but slows camera movement.
- Not firing allows recoil and instability to recover.

### Weakpoints

Targets have weakpoint zones, such as center mass or head / bullseye areas.

Weakpoint hits grant:

- Higher score.
- Faster target elimination where applicable.
- Better rating metrics.

## 10. Rating And Scoring

Use military-style ratings:

- `S`
- `A`
- `B`
- `C`
- `D`

Results screen should show:

- Rating.
- Clear time.
- Accuracy.
- Average reaction time.
- Ammo efficiency.
- Weakpoint hit rate.
- Failure reason and recommendation if failed.

Failure screen should explain the cause, such as:

- Ammo exhausted.
- Defense line broken.
- Accuracy too low for a high rating.

## 11. Records And Save Data

Use `localStorage`.

### Formal Records

Formal records are saved for standard unmodified weapons.

Record page should show best formal records by:

- Level.
- Difficulty.
- Weapon.

Each record includes:

- Best rating.
- Best time.
- Accuracy.
- Weakpoint hit rate.
- Ammo efficiency.

### Custom Records

Custom weapon runs do not overwrite formal records.

The records page includes a custom records tab.

Custom records are grouped by:

- Level.
- Difficulty.
- Base weapon.
- Custom configuration slot.

## 12. Weapon Customization

The game includes both sandbox sliders and attachments.

### Customization Impact

- Standard weapons can save formal best records.
- Custom weapons can be used in formal levels.
- Custom weapon runs save only custom records.
- Custom records do not overwrite formal best records.

### Sandbox Sliders

Sliders can have exaggerated sandbox ranges.

Potential adjustable values:

- Damage.
- Recoil.
- Spread.
- Magazine size.
- Reserve ammo.
- Fire rate.
- Reload speed.
- Aim down sights speed.
- Magnification.
- Breath sway.

### Attachments

All attachments are unlocked from the beginning.

Attachment slots:

1. Optic.
2. Muzzle.
3. Grip.
4. Magazine.
5. Stock.
6. Ammo type.

Attachments should have clear advantages and tradeoffs.

Optics determine aim down sights style, such as:

- Iron sights.
- Red dot.
- Low-power optic.
- High-power sniper scope.

Optics affect:

- Magnification.
- Field of view.
- Aim down sights speed.
- Scope overlay / reticle style.

### Saved Custom Configurations

Each base weapon can save 3 custom configurations.

Total custom slots:

- Pistol: 3.
- Rifle: 3.
- Sniper rifle: 3.

## 13. Test Wall Mode

Add a simple test wall mode.

Purpose:

- Test recoil.
- Test spread.
- Test aim down sights behavior.
- Test custom weapon settings.
- Test gyroscope and touch aiming.

The test wall does not need to be a full free training mode in the first version.

## 14. Settings

Settings are organized into five tabs:

1. Audio.
2. Controls.
3. Video.
4. Language.
5. Data.

### Audio

- Master volume.
- SFX volume.
- Music volume.

### Controls

- Mouse sensitivity.
- Touch sensitivity.
- Gyroscope sensitivity.
- Invert Y axis.
- Keyboard binding customization.
- Left-handed / alternate control presets.
- Touch button size.
- Touch button opacity.
- Touch button position customization.

### Video

- Crosshair style:
  - Dot.
  - Cross.
  - Ring.
- Screen shake.
- Visual quality.

### Language

- Traditional Chinese.
- English.

### Data

- Reset records.
- Reset settings.
- Reset custom weapon configurations.

## 15. Screen And Layout Strategy

- Desktop: adaptive to browser window.
- Mobile: landscape-first.
- Mobile game area: force 16:9 landscape-safe layout.
- Portrait mobile: show rotate prompt.
- Game UI must avoid overlapping controls and critical targets.

## 16. First Phase Acceptance Criteria

First phase is function-first.

The first playable version is accepted when:

- Main menu works.
- Mission setup works.
- Level selection works.
- Difficulty selection works.
- Weapon selection works.
- Three levels are playable from start to result.
- Shooting works.
- Aim down sights works.
- Reload works.
- Ammo and failure rules work.
- Weakpoint hits work.
- Pause works.
- Settings page exists.
- Records page exists.
- Formal records save correctly.
- Custom weapon configuration can be saved and used.
- Custom records are separated from formal records.
- Test wall mode exists.
- Traditional Chinese / English switching works.
- Desktop mouse controls work.
- Desktop keyboard customization works at a basic level.
- Mobile touch controls work at a basic level.
- Mobile touch layout customization works at a basic level.
- Mobile landscape prompt works.
- Mobile offline launch works after the first online visit and cache install.

Polish items such as final art, final sound mix, advanced animations, and balance tuning can improve after this phase.
