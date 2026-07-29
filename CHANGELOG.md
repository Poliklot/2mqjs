# Changelog

All notable changes to this project will be documented in this file.

This project uses [Release Please](https://github.com/googleapis/release-please) and follows Conventional Commits for automated release notes.

## [0.1.5](https://github.com/Poliklot/2mqjs/compare/2mqjs-v0.1.4...2mqjs-v0.1.5) (2026-07-29)


### Bug Fixes

* issue: bug(ports-workers): prevent worker port echo loops and add targeted routing  [#21](https://github.com/Poliklot/2mqjs/issues/21) ([#33](https://github.com/Poliklot/2mqjs/issues/33)) ([a50924c](https://github.com/Poliklot/2mqjs/commit/a50924c555a5bfe312191950c51e8d8824e7b3e1))
* make failed component lifecycles retryable ([#32](https://github.com/Poliklot/2mqjs/issues/32)) ([38804b2](https://github.com/Poliklot/2mqjs/commit/38804b2751bb3184c473fd037b49749cd8d83b5e))
* решение bug(store): updater-based set/update can lose sequential changes before the next snapshot [#20](https://github.com/Poliklot/2mqjs/issues/20) ([#31](https://github.com/Poliklot/2mqjs/issues/31)) ([24d9c9c](https://github.com/Poliklot/2mqjs/commit/24d9c9c57187c603c32b0bf742f35e4168530e8c))

## [0.1.4](https://github.com/Poliklot/2mqjs/compare/2mqjs-v0.1.3...2mqjs-v0.1.4) (2026-07-27)

### Bug Fixes

* update Playwright, Vite, and Vitest while preserving Node 18 runtime smoke coverage

## [0.1.3](https://github.com/Poliklot/2mqjs/compare/2mqjs-v0.1.2...2mqjs-v0.1.3) (2026-07-23)


### Bug Fixes

* validate worker handler names ([#29](https://github.com/Poliklot/2mqjs/issues/29)) ([f365ad2](https://github.com/Poliklot/2mqjs/commit/f365ad2b291eaaff1ad87635baa46551c28a50f0))

## [0.1.2](https://github.com/Poliklot/2mqjs/compare/2mqjs-v0.1.1...2mqjs-v0.1.2) (2026-07-23)


### Bug Fixes

* clean up runtime listener lifecycles ([#27](https://github.com/Poliklot/2mqjs/issues/27)) ([b67d6a4](https://github.com/Poliklot/2mqjs/commit/b67d6a43d53bc986222815b160d824e0ab2886ef))

## [0.1.1](https://github.com/Poliklot/2mqjs/compare/2mqjs-v0.1.0...2mqjs-v0.1.1) (2026-06-29)


### Bug Fixes

* align npm provenance metadata ([cd80e7c](https://github.com/Poliklot/2mqjs/commit/cd80e7c2fdda927ca9a8d6a3097b4c37005a7c68))

## [0.1.0](https://github.com/Poliklot/2mqjs/compare/2mqjs-v0.0.4...2mqjs-v0.1.0) (2026-06-29)


### Features

* Доработана корректная работана с типами. ([dedfafc](https://github.com/Poliklot/2mqjs/commit/dedfafcab3c259431c58f94465026778286bb46a))
* Убран корневой экспорт, добавлены subpath-exports. ([4972f9b](https://github.com/Poliklot/2mqjs/commit/4972f9b387c46c19427c1a41c62c62d1bc49a1ae))
* Убран корневой экспорт, добавлены subpath-exports. ([51ebf77](https://github.com/Poliklot/2mqjs/commit/51ebf779159922453ce7c89cc5147b4cb0924b22))


### Bug Fixes

* accept release-please package tags ([8a18ec5](https://github.com/Poliklot/2mqjs/commit/8a18ec57b4fc474d0f926dc874c7cb370354c8c7))

## [0.0.4](https://github.com/Poliklot/2mqjs/releases/tag/v0.0.4) - 2025-08-14

### Added

- Subpath exports for `ports`, `events`, `workers`, `components`, `tasks`, and `store`.
- Documentation for core modules.
