# NAD - Node Agent Daemon

* [Installation](#installation)
  * [Automated](#automated-install) recommended
  * [Manual](#manual-install)
  * [Source](#source-install)
* [NAD Options](OPTIONS.md)
* [Development](DEVELOPMENT.md)

## Overview

NAD is a portable, extensible, lightweight metric collection agent. It is the recommended way to collect system metrics for the [Circonus](Circonus.com) monitoring platform.

NAD comes with a [rich set of plugins](https://github.com/circonus-labs/nad/tree/master/plugins) which collect:
- System metrics on Linux, Solaris, FreeBSD and OpenBSD
- Application metrics for [MySQL](https://www.mysql.com), [PostgreSQL](https://www.postgresql.org/), [HAProxy](http://www.haproxy.org), [Cassandra](http://cassandra.apache.org/) and more

Further, applications can be easily added using a simple but powerful plugin system. We welcome further contributions by the community. Just submit a pull request against this repository.

### Features

* Full support for [histogram metrics](https://www.circonus.com/understanding-data-with-histograms/).
* Support for Circonus real-time (1s) dashboards and graphing.
* Multiple data submission paradigms:
  * [reverse](https://www.circonus.com/pully-mcpushface/) - nad initiates a TCP connection to Circonus. Circonus uses that connection to request data as needed. This allows nad to operate behind a NAT.
  * pull - nad exposes an HTTP endpoint (default: listen on TCP port 2609, e.g. http://localhost:2609) serving metrics in JSON format, Circonus collects metrics from there.
* [Self-configure](self-config/) with Circonus via the command line with a user-provided JSON configuration file.

# Installation

## Automated Install

The easiest, and recommended, method to install nad is via the Circonus one-step Installer (COSI). See the [COSI documentation](https://github.com/circonus-labs/circonus-one-step-install) for details.

**COSI Features**

* one command install (fully automated, install nad, create checks, graphs, worksheets and dashboards)
* or download the install script and customize to your needs
* customizable templates for checks, graphs, dashboards and worksheets
* supports automation via orchestration systems (e.g. ansible, puppet, shell scripts, etc.)
* cosi-site can be installed and run locally for complete control

## Manual Install

For convenience and flexibility, we provide pre-built nad packages for selected platforms at [updates.circonus.net](http://updates.circonus.net/node-agent/packages/) these are self-contained "omnibus" packages built for the target OS. They contain the correct version of NodeJS and binaries for certain nad plugins. These packages will install nad in `/opt/circonus` and will configure and start nad as a service.

At the time of this writing, these are:

* deb packages - Ubuntu: 14.04, 16.04
* rpm packages - CentOS: EL6, EL7

## Source Install

### Requirements

* NodeJS v4.4.5+ must be installed and available as `node` on the PATH.
* A basic development environment (compiler, GNU make, etc.) in order to build certain plugins.
* For OmniOS/FreeBSD/etc. you must install and use `gmake`.

```
git clone https://github.com/circonus-labs/nad.git
cd nad
sudo make install
```

This will build a default set of plugins and install nad in `/opt/circonus`. You may then run nad with: `/opt/circonus/sbin/nad`.


### OS Specific Installation

These OS-specific install targets enable default plugins and install init scripts. For more details, see below. Note this does not *enable* or *start* nad as a service.

* Ubuntu/Debian `make install-ubuntu`
  * Ubuntu 14.04 -upstart- `initctl start nad`
  * Ubuntu 16.04 -systemd- `systemctl start nad`
* RHEL/CentOS `make install-rhel`
  * CentOS 6.8 -upstart- `initctl start nad`
  * CentOS 7.3 -systemd- `systemctl start nad`
* Illumos (SmartOS, OmniOS, OpenIndiana, etc.) `gmake install-illumos`
  * `svcadm enable nad`
* FreeBSD `PREFIX=/usr/local gmake install-freebsd`
  * Add `nad_enable="YES"` to `/etc/rc.conf`
  * `service start nad`
* OpenBSD `PREFIX=/usr/local gmake install-openbsd`
  * Add `nad_enable="YES"` to `/etc/rc.conf`
  * `service start nad`

## Configuration

The nad configuration is contained in `/opt/circonus/etc/nad.conf`, see [OPTIONS](OPTIONS.md) for details on the various command line options which can be used to customize nad.

## Plugins

nad will run scripts from the config directory, only from that
directory, and not subdirectories. The best practice is to write your
scripts in subdirectories of the config dir and soft link to them to
enable their execution.

Some scripts distributed with nad need to be compiled (yes, they aren't
actually scripts, they are ELF executables).  Since not all programs
can be compiled on all platforms, you need to go build them as needed.
There are makefiles from which to pick and choose.

If you write a set of scripts/programs, you can describe them in a
`.index.json` file and they will be reported on when you run `nad -i`.

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
