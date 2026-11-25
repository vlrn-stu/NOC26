# Agent instructions

This is a workshop demo app with two parts: fetching weather data from an OGC EDR service, and visualising it on a map with OpenLayers in Angular. It starts with a single `BitmapLayer` showing 2 m temperature; students extend it with new features.

## Adding features

Before adding or changing a feature, read [.agents/skills/extend-weather-map/SKILL.md](.agents/skills/extend-weather-map/SKILL.md). To use data from another weather model, satellite or radar, read [.agents/skills/add-edr-dataset/SKILL.md](.agents/skills/add-edr-dataset/SKILL.md) and first ask the user for the EDR URL of that service (e.g. `https://api.openweather.cloud/edr/shmu/aladin/slovakia`; all services are listed at https://api.openweather.cloud/). The most important rules:

- `src/app/visualizations/` holds only layers, renderers (and shaders) and legend visualisation.
- Ready-to-use constants (datasets, model parameters, gradients) go in `src/app/consts/`; their types go in `src/app/types/`, in files named `<name>.type.ts` (e.g. `types/edr-parameters.type.ts`). `consts/` simulates configuration or user input that a real app would get from a UI or a config file: keep it plain data, import it only in `MapComponent`, and pass the values on as arguments.
- Logic that works with the map's OpenLayers layers (listeners, collecting information from layers) goes in `MapLayersHelperService` (`src/app/map/map-layers-helper.service.ts`).
- Layers are created and configured in `createLayers()` in `src/app/map/map.ts`; keep it short and declarative.
- Layers are static: configure them through constructor options, without setters or update methods.
- `EdrParameter` is the only parameter type. For composite parameters (e.g. wind with U and V components), extend `EdrParameter` and add the parameter to `ALADIN_PARAMETERS` (or to a constant of the same type for another dataset) instead of creating new parameter types or constants.

## No tests

This repository intentionally has no tests. Do not create test files (`*.spec.ts`, `*.test.ts`, e2e tests), install testing packages, or add test scripts or configuration. To check a change, run `npm run build` and look at the app with `npm start`.

The full rules are in [.agents/skills/no-tests/SKILL.md](.agents/skills/no-tests/SKILL.md).

## Skills describe the starting app

The skills describe the app as the workshop starts. Once features have been added, the code may differ from them; then the code is right, so follow it. Do not edit `.agents/skills/` or `.claude/skills/` unless the user asks you to: do not document new features in them, mark recipes as done or update their descriptions after a change.

## Skill copies

Every skill exists twice: in `.agents/skills/` (read by Codex, Cursor, Copilot and others) and in `.claude/skills/` (read by Claude Code). When the user asks you to change a skill, change both copies identically.
