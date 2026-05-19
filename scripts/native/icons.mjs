#!/usr/bin/env node
/**
 * icons -- regenerate all platform icons from ui/static/favicon.svg.
 *
 * Outputs:
 *   ui/electron/build/{icon.png, icon.icns, icon.ico}
 *   ui/ios/App/App/Assets.xcassets/AppIcon.appiconset/* (18 slots)
 *   ui/static/icons/heron-{192,256,384,512}.png
 *
 * Idempotent -- re-running produces the same output.
 */
import { step, run, ok, ROOT } from './_lib.mjs';
import { join } from 'node:path';

step(1, 'Generating icons');
run('node', [join(ROOT, 'scripts', 'native', 'icons', 'generate-icons.mjs')]);
ok('All platform icons regenerated.');
