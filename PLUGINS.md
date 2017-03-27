# NAD Plugins

## Plugins

nad will run scripts from the config directory, only from that
directory, and not subdirectories. The best practice is to write your
scripts in subdirectories of the config dir and soft link to them to
enable their execution.

Some scripts distributed with nad need to be compiled (yes, they aren't
actually scripts, they are ELF executables).  Since not all programs
can be compiled on all platforms, you need to go build them as needed.
There are makefiles from which to pick and choose.

## Inventory/Index
(_DEPRECATED_)
If you write a set of scripts/programs, you can describe them in a
`.index.json` file and they will be reported on when you run `nad -i`.
