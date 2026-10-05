.PHONY: validate build test check link unlink list actions install-skills uninstall-skills help

help:
	@echo "make validate   check every plugin manifest and skill file"
	@echo "make build      compile every TypeScript plugin to its committed dist/"
	@echo "make test       run unit tests for every plugin that ships a test suite"
	@echo "make check      validate + build + test"
	@echo "make link       herdr plugin link every plugin in plugins/ (local dev)"
	@echo "make list       herdr plugin list"
	@echo "make actions    herdr plugin action list for every plugin in this repo"
	@echo "make unlink     herdr plugin unlink every plugin id in this repo"
	@echo "make install-skills    copy skills/ into ~/.agents/skills, symlink into agent dirs"
	@echo "make uninstall-skills  remove this repo's skills from those directories"

validate:
	@python3 scripts/validate.py

# Herdr runs plugin commands with whatever `node` is on the server's PATH, which
# may be too old to execute .ts files. Compiled output is committed for that reason.
build:
	@found=0; \
	for config in plugins/*/tsconfig.build.json; do \
	  [ -f "$$config" ] || continue; \
	  found=1; \
	  dir=$$(dirname "$$config"); \
	  echo "== $$dir"; \
	  (cd "$$dir" && npx --yes -p typescript@5 tsc -p tsconfig.build.json) || exit 1; \
	done; \
	[ "$$found" -eq 0 ] && echo "no TypeScript plugins to build" || true

test:
	@found=0; \
	for pkg in plugins/*/package.json; do \
	  [ -f "$$pkg" ] || continue; \
	  found=1; \
	  dir=$$(dirname "$$pkg"); \
	  echo "== $$dir"; \
	  (cd "$$dir" && npm test) || exit 1; \
	done; \
	[ "$$found" -eq 0 ] && echo "no plugin test suites in this repo yet" || true

check: validate build test

link: validate
	@bash scripts/link-all.sh

list:
	@herdr plugin list

actions:
	@for manifest in plugins/*/herdr-plugin.toml; do \
	  id=$$(sed -n 's/^id[[:space:]]*=[[:space:]]*"\([^"]*\)".*/\1/p' "$$manifest" | head -n 1); \
	  echo "== $$id"; herdr plugin action list --plugin "$$id" || true; \
	done

unlink:
	@for manifest in plugins/*/herdr-plugin.toml; do \
	  id=$$(sed -n 's/^id[[:space:]]*=[[:space:]]*"\([^"]*\)".*/\1/p' "$$manifest" | head -n 1); \
	  [ -n "$$id" ] && herdr plugin unlink "$$id" || true; \
	done

install-skills:
	@bash scripts/install-skills.sh $(if $(DRY),--dry-run,)

uninstall-skills:
	@bash scripts/install-skills.sh --unlink
