# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- ESLint and Prettier configuration.
- Project metadata files (LICENSE, CHANGELOG, etc.).
- CI workflow for GitHub Actions.

### Changed

- Total score computation now prefers `testScore` from the result XML over the sum of item scores. This may be a breaking change for consumers relying on the previous behavior.

## [1.0.0] - 2026-02-05

### Added

- Initial release.
