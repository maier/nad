# NAD - Node Agent Daemon

* [Overview](#overview)
    * [Features](#features)
* [Installation](#installation)
    * [Automated](#automated-install) *recommended*
    * [Manual](#manual-install)
    * [Source](#source-install)
* [Running NAD](#running)
    * [Command line](#command-line)
    * [Service](#as-a-service)
    * [Interface](#interface)
* [Configuration options](#options)
    * [General](#opt_general)
    * [Reverse](#opt_reverse)
    * [API](#opt_api)
    * [SSL](#opt_ssl)
    * [StatsD](#statsd)
    * [Miscellaneous](#opt_misc)
* [Plugins](#plugins)
    * [Enable](#plugin_enable)
    * [Disable](#plugin_disable)
    * [Verify](#plugin_verify)
    * [Developing](DEVELOPMENT.md#plugins)
* [NAD Development](DEVELOPMENT.md)

---

## Overview

NAD is a portable, extensible, lightweight metric collection agent. It is the recommended way to collect system metrics for the [Circonus](https://circonus.com/) monitoring platform.

NAD comes with a [rich set of plugins](plugins/) which collect:

* System metrics on Linux, Solaris, FreeBSD and OpenBSD
* Application metrics for [MySQL](https://www.mysql.com), [PostgreSQL](https://www.postgresql.org/), [HAProxy](http://www.haproxy.org), [Cassandra](http://cassandra.apache.org/) and more

Further, applications can be easily added using a simple but powerful plugin system. We welcome further contributions by the community. Just submit a pull request against this repository.

### Features

* Simple HTTP interface for metric collection.
* Metrics exposed in easy to parse JSON format.
* Supports SSL for securing HTTP interface.
* Full support for [histogram metrics](https://www.circonus.com/understanding-data-with-histograms/).
* Support for Circonus real-time (1s) dashboards and graphing.
* Provides local StatsD interface for application metric submission.
* Multiple data submission paradigms:
    * pull - Circonus collects metrics using HTTP interface.
    * [reverse](https://www.circonus.com/pully-mcpushface/) - Function behind NAT. NAD initiates secure TCP connection, Circonus uses connection to collect metrics.
* [Self-configure](self-config/) with Circonus via the command line with a user-provided JSON configuration file.

# Installation

## Automated Install

The easiest, and recommended, method to install NAD is via the Circonus one-step Installer (COSI). See the [COSI documentation](https://github.com/circonus-labs/circonus-one-step-install) for details.

Benefits of using COSI:

* one command install (fully automated, install NAD, create checks, graphs, worksheets and dashboards)
* or download the install script and customize to your needs
* customizable templates for checks, graphs, dashboards and worksheets
* supports automation via orchestration systems (e.g. ansible, puppet, shell scripts, etc.)
* cosi-site can be installed and run locally for complete control

## Manual Install

For convenience and flexibility, pre-built packages are available for selected platforms from [updates.circonus.net](http://updates.circonus.net/node-agent/packages/). These are self-contained *omnibus* packages built for the target OS. Packages contain the correct version of NodeJS, binaries for platform-specific plugins, and applicable service configuration. These packages will install NAD in `/opt/circonus` and configure and start NAD as a service.

At the time of this writing, these are:

* deb packages - Ubuntu: 14.04, 16.04
* rpm packages - CentOS: EL6, EL7

An up-to-date list of currently supported platforms is available from [COSI](https://onestep.circonus.com/) (list returned in JSON).

## Source Install

### Build requirements

* NodeJS v4.4.5+ must be installed, `node` and `npm` available in the PATH.
* A basic development environment (compiler, GNU make, etc.) in order to build certain plugins. For OmniOS/FreeBSD/etc. you must install and use `gmake`.

### Basic `install` target

A basic install from source installs NAD in `/opt/circonus`.

#### For CentOS/Ubuntu:

```
git clone https://github.com/circonus-labs/nad.git
cd nad
sudo make install
```

#### For Illumos/FreeBSD/OpenBSD:

```
git clone https://github.com/circonus-labs/nad.git
cd nad
sudo gmake install
```

### OS `install` targets

In addition to the basic `install` target, there are OS-specific installation targets. Which will build certain plugins for the specific OS platform, enable default plugins, and install an OS-specific service configuration.

* `make install-ubuntu`
* `make install-rhel`
* `gmake install-illumos`
* `gmake install-freebsd`
* `gmake install-openbsd`

### Install files and directories

| path                                         | description                                        |
| -------------------------------------------- | -------------------------------------------------- |
| **Core Directories** ||
| `/opt/circonus`                              | default installation location                      |
| `/opt/circonus/bin`                          | nad utilities, if applicable                       |
| `/opt/circonus/etc`                          | configurations                                     |
| `/opt/circonus/etc/node-agent.d`             | plugin directory                                   |
| `/opt/circonus/lib/node_agent`               | nad library packages                               |
| `/opt/circonus/log`                          | nad log directory (if applicable)                  |
| `/opt/circonus/man`                          | nad man page                                       |
| `/opt/circonus/sbin`                         | nad daemon                                         |
| **Core Files** ||
| `/opt/circonus/etc/nad.conf`                 | main nad configuration (see [Options](#config))    |
| `/opt/circonus/sbin/nad`                     | nad startup script                                 |
| **Miscellaneous Files** ||
| `/opt/circonus/bin/nad-log`                  | nad log viewer script, if applicable               |
| `/opt/circonus/log/nad.log`                  | nad log, if applicable                             |
| `/var/run/nad.pid`                           | running nad pid file, if applicable                |
| `/lib/systemd/system/nad.service`            | systemd service configuration, if applicable       |
| `/etc/init/nad.conf`                         | upstart service configuration, if applicable       |
| `/var/svc/manifest/network/circonus/nad.xml` | smf service configuration, if applicable           |
| `/var/svc/method/circonus-nad`               | smf method script, if applicable                   |
| `/etc/rc.d/nad`                              | FreeBSD service configuration, if applicable       |

# Running

## Command line

`/opt/circonus/sbin/nad [options]`

## As a service

* Systemd based systems - CentOS 7.x and Ubuntu 16.04
    * Configuration: `/lib/systemd/system/nad.service`
    * Enable: `systemctl enable nad`
    * Start: `systemctl start nad`
* Upstart based systems - CentOS 6.x and Ubuntu 14.04
    * Configuration: `/etc/init/nad.conf`
    * Enable: presence of configuration
    * Start: `initctl start nad`
* SMF based systems - OmniOS/Illumos/etc.
    * Configuration: `/var/svc/manifest/network/circonus/nad.xml`
    * Enable: `svccfg import /var/svc/manifest/network/circonus/nad.xml`
    * Start: `svcadm enable nad`
* FreeBSD
    * Configuration: `/etc/rc.d/nad`
    * Enable: add `nad_enable="YES"` to `/etc/rc.conf`
    * Start: `service start nad`
* OpenBSD - manual service configuration/installation required
    > For example, add the following to your `/etc/rc.local`:
    >```sh
    >if [ -x /opt/circonus/sbin/nad ]; then
    >    echo -n ' nad'
    >    /opt/circonus/sbin/nad --daemon --syslog
    >fi
    >```
    > Will start NAD and redirect logging to syslog via the `logger` command. To redirect logging to a file or elsewhere, replace the `--syslog` option with redirection e.g. `> /tmp/my.log 2>&1`.

## Interface

NAD exposes an HTTP endpoint, the default is to listen to TCP:2609 (e.g. `curl http://127.0.0.1:2609/`). The output from all requests is JSON.

| URI | description |
| --- | --- |
| `/` | run all plugins, consolidate output, return metrics. |
| `/run` | run all plugins, consolidate output, return metrics. |
| `/run/plugin` | run a single plugin and return metrics. `plugin` is file name minus extension.<br />e.g. the `vm.sh` plugin becomes `/run/vm` |
| `/inventory` | return list of currently enabled and loaded plugins. |
| `/inventory?full` | return list of currently enabled and loaded plugins with full details for each plugin. |

# Options

Options should be added to the `NAD_OPTS` variable in `/opt/circonus/etc/nad.conf`.

| Option                    | Description |
| ---                       | ---         |
| **<a name="opt_general">General</a>** ||
| `--plugin-dir <dir>`      | Plugin directory. Default: `/opt/circonus/etc/node-agent.d` |
| `--listen <spec>`         | Listening IP address and port. (`ip`\|`port`\|`ip:port`) Default: 2609 |
| `--no-statsd`             | Disable built-in StatsD interface. |
| `--statsd-config <file>`  | Configuration file for StatsD interface. Default: none |
| **<a name="opt_reverse">Reverse</a>**              ||
| `-r, --reverse`           | Use reverse connection to broker. Default: false |
| `--cid <cid>`             | Check bundle ID for reverse connection. Default: from cosi |
| `--broker-ca <file>`      | CA file for broker reverse connection. Default: fetch from API |
| `--target <target>`       | Target host -- see [Target](#target) below. Default: `os.hostname()` |
| **<a name="opt_api">API</a>**                  ||
| `--api-key <key>`         | Circonus API Token key. Default: none |
| `--api-app <app>`         | Circonus API Token app. Default: nad |
| `--api-url <url>`         | Circonus API URL. Default: `https://api.circonus.com/v2/` |
| `--api-ca <file>`         | CA file for API URL. Default: none |
| **<a name="opt_ssl">SSL</a>**                  ||
| `--ssl-listen <spec>`     | SSL listening IP address and port. (`ip`\|`port`\|`ip:port`) Default: none |
| `--ssl-cert <file>`       | SSL certificate PEM file, required for SSL. Default: `<plugin-dir>/na.crt`|
| `--ssl-key <file>`        | SSL certificate key PEM file, required for SSL. Default: `<plugin-dir>/na.key` |
| `--ssl-ca <file>`         | SSL CA certificate PEM file, required for SSL w/verify. Default: `<plugin-dir>/na.ca` |
| `--ssl-verify`            | Enable SSL verification. Default: false |
| **<a name="opt_misc">Miscellaneous</a>**        ||
| `-u, --uid <id>`          | User id to drop privileges to on start. Default: nobody |
| `-g, --gid <id>`          | Group id to drop privileges to on start. Default: nobody |
| `--log-level <level>`     | Log level (trace, debug, info, warn, error, fatal). Default: info |
| `-d, --debug`             | Enable debug logging (verbose). Default: false |
| `-t, --trace`             | Enable trace logging (very verbose). Default: false |
| `--no-watch`              | Disable automatic plugin-dir rescan on changes. Send `SIGHUP` to force rescan. |
| `-h, --help`              | Output usage information and exit. |
| `-V, --version`           | Output the version number and exit. |
| `--debugdir`              | Create debug files for each plugin and write to this directory. Default: none |
| `--wipedebugdir`          | Wipe debug directory clean before each write. Default: false |
| `-i, --inventory`         | Offline inventory and exit. |
| **Self-configure**       ||
| `--hostname <host>`       | Hostname self-configure to use in check and graph names. Default: `os.hostname()` |
| `--brokerid <id>`         | Broker ID for self-configure to use for creating check. Default: **required** |
| `--configfile <file>`     | File in plugin-dir for self-configure. Default: **required** |
| **DEPRECATED**            | Obsolescence 1/2018 |
| `-c <dir>`                | DEPRECATED use --plugin-dir |
| `-p <spec>`               | DEPRECATED use --listen |
| `-s <spec>`               | DEPRECATED use --ssl-listen |
| `-v`                      | DEPRECATED use --ssl-verify |
| `--authtoken <token>`     | DEPRECATED use --api-key |
| `--apihost <host>`        | DEPRECATED use --api-url |
| `--apiport <port>`        | DEPRECATED use --api-url |
| `--apipath <path>`        | DEPRECATED use --api-url |
| `--apiprotocol <proto>`   | DEPRECATED use --api-url |
| `--apiverbose`            | DEPRECATED NOP, see --debug |
| `--sslcert <file>`        | DEPRECATED use --ssl-cert |
| `--sslkey <file>`         | DEPRECATED use --ssl-key |
| `--sslca <file>`          | DEPRECATED use --ssl-ca |
| `--cafile <file>`         | DEPRECATED use --broker-ca |

## Target

Is used by both Reverse and Self-configure.
1. Reverse will use it to search for a check if a cid is not provided and cosi was not used to setup the host.
1. Self-configure will use it to configure the check on the broker - it is the host (IP or FQDN) the broker will connect to in order to pull metrics.

## Reverse mode

Set up reverse connection for metric collection.

If the host was registered with COSI then the only *required* parameter is `--reverse`, the rest of the information will be retrieved from the COSI configuration.

If the host was *not* registered with COSI then a valid API Token Key must be supplied. If an explicit Check Bundle ID is supplied, NAD will use the check if it is still active. If no Check Bundle ID is supplied, NAD will search for a json:nad check where the check target matches the supplied (or default) `--target`.

### Required:

* `--reverse` flag signals nad to setup a reverse connection to the broker.
* `--api-key` - optional if cosi configuration exists on host, otherwise, api key is required.

### Optional:

* `--cid` - will pull from cosi configuration, if available.
* `--target` - to enable searching for a check (e.g. on a host not registered by cosi).

## StatsD

See [StatsD module documentation](lib/statsd/README.md) for details on configuring options specific to StatsD. Note that StatsD uses a *push* method of metric transport, as such, it is not fully compatible with real-time graphing (graphs will update as metrics are received rather than at the higher cadence 1s interval).

## Self-configure

**DEPRECATED** -- use of [COSI](https://github.com/circonus-labs/circonus-one-step-install) is recommended.

Providing an API token key without the reverse flag will initiate a self-configuration attempt.

### Required:

* `--api-key`
* `--target`
* `--brokerid`
* `--configfile`

### Optional:

* `--hostname`

# Plugins

NAD plugins are located in the plugin directory (default: `/opt/circonus/etc/node-agent.d`, configurable with `--plugin-dir` option). If the automated or manual install were used, platform specific plugins for the current OS are already built. If the source installation method was used - change to the appropriate directory for the current OS and run `make` or `gmake` to build the platform specific plugins for the OS. (e.g. `cd /opt/circonus/etc/node-agent.d/linux && make`)

## <a name="plugin_enable">Enabling</a>

When NAD starts it scans the plugin directory for plugins to enable. Rudimentary filters are used to determine what is a plugin and what is not. e.g. entry is not a directory, entry has a name in the format `name.ext`, entry is executable, entry is not a configuration file (extension of `.json` or `.conf`), etc. It is recommended that plugins be stored in subdirectories of the plugin directory.  Subdirectories are not scanned, those plugins will not be loaded and enabled without an additional step.

To enable a plugin, create a symlink in the plugin directory. For example:

```sh
cd /opt/circonus/etc/node-agent.d  # change to plugin directory
ln -s linux/vm.sh .                # create symlink
```

The plugin will be automatically found and loaded if file watching is enabled (the default). If file watching is disabled (`--no-watch`), send a `SIGHUP` to the NAD process to trigger scanning for plugins.

## <a name="plugin_disable">Disabling</a>

To disable a plugin, delete the symlink in the plugin directory. For example:

```sh
cd /opt/circonus/etc/node-agent.d  # change to plugin directory
rm vm.sh                           # delete symlink
```

The plugin will automatically be purged from the loaded plugins if file watching is enabled (the default). If file watching is disabled (`--no-watch`), send a `SIGHUP` to the NAD process to trigger scanning for plugins.

## <a name="plugin_verify">Verify</a>

The output from a plugin can be verified/inspected at any time by making a request for that specific plugin:

`curl http://localhost:2609/run/name`

where `name` is the name of the plugin without the extension. NAD will respond with the metrics from that plugin in JSON format.

## Inventory

The currently loaded plugin inventory can be seen by making a request to the `inventory` endpoint.

`curl http://localhost:2609/inventory`

NAD will respond with a list of the currently loaded plugins. The `inventory` endpoint supports one argument, `?full`, which includes additional details on each plugin. The output of the inventory endpoint is JSON, enabling it to be used by orchestration and monitoring tooling.

## Custom

For information on creating custom plugins see the Plugin section of [DEVELOPMENT.md](DEVELOPMENT.md#plugins).
