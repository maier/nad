# NAD development

# Core

## Using a custom NAD fork

1. Fork NAD repository from https://github.com/circonus-labs/nad
1. Clone
1. Update `packaging/make-omnibus`, change `NAD_REPO` to point to the fork URL
1. Work on it
1. When done, commit, push, and run `cd packaging && ./make-omnibus`

If a specific branch is needed, prime the build system with it.

```sh
mkdir -p /tmp/nad-omnibus-build
pushd /tmp/nad-omnibus-build
git clone <fork_repo_url>
cd nad
git checkout <branch>
popd
```

Then run `make-omnibus` from the original clone.

# Plugins
