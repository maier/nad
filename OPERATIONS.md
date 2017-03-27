## Operations

First, there are no config files for nad. You just run it and it works.
It has a default directory out of which it executes scripts/executables.
When you install it, all available plugins will be installed in
subdirectories under the "config dir".  To enable a script, simply link
it from the "config dir".

The defaults are as follows:

- config dir: `/opt/circonus/etc/node-agent.d/`, change using `-c` on the command line.
- port: `2609`, this can be changed using `-p` on the command line.

### Running

On Solaris or illumos you can use smf.  First, node needs to be in your path,
so you might need to edit the SMF manifest to alter the PATH. After install:

    # svccfg import /var/svc/manifest/network/circonus/nad.xml

On RHEL/CentOS, assuming you did `make install-rhel`:

    # /sbin/chkconfig nad on && /etc/init.d/nad start

On Ubuntu, assuming you did `make install-ubuntu`:

    # /usr/sbin/update-rc.d nad defaults 98 02 && /etc/init.d/nad start

On FreeBSD, assuming you did `make install-freebsd`:

    # /etc/rc.d/nad start

On OpenBSD, assuming you did `make install-openbsd`, add the following to your `/etc/rc.local`:

    if [ -x /opt/circonus/sbin/nad ]; then
        export NODE_PATH="/opt/circonus/lib/node_modules"
        echo -n ' nad'; /opt/circonus/sbin/nad >/dev/null 2>&1 &
    fi

On other platforms, just run nad in the background. There is one required
environment variable:

   `# export NODE_PATH="/opt/circonus/lib/node_modules"`

### Setup

If you used one of the `install-<os>` options above, the default set of
plugins is already enabled.  You may enable additional plugins and/or
create your own custom plugins.  See the man page for details on creating
and activating plugins.

After which, you should be able to:

    # curl http://localhost:2609/

and see all the beautiful metrics.

You can run a single plugin by name, like so:

    # curl http://localhost:2609/run/name

where "name" is the plugin name, minus any file extension.

#### Why did we "make" in the config directory?

You'll notice that some plugins require compilation, and you may ask "Why?"
For example, on illumos, aggcpu.elf is a compiled binary
(because calculating aggregate CPU info is expensive using "the UNIX way").
The install will compile and link any plugins that need compiling and linking.

#### What about SSL?


nad supports SSL. Refer to the man page for more information.


## Man

Further documentation can be found in the nad manpage: `man nad`.

If nad is not installed, you can render the manpage locally with:
```
groff -mmandoc -Tascii nad.8 | less
```

A copy is also available on the [wiki](https://github.com/circonus-labs/nad/wiki/manpage).

