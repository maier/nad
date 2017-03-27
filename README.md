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
* [Configuration options](#options)
  * [General](#opt_general)
  * [Reverse](#opt_reverse)
  * [API](#opt_api)
  * [SSL](#opt_ssl)
  * [StatsD](#statsd)
  * [Miscellaneous](#opt_misc)
* [Plugin management and development](PLUGINS.md)
* [NAD Development](DEVELOPMENT.md)

---

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

For convenience and flexibility, pre-built nad packages are available for selected platforms from [updates.circonus.net](http://updates.circonus.net/node-agent/packages/). These are self-contained *omnibus* packages built for the target OS. Packages contain the correct version of NodeJS, binaries for certain nad plugins, and applicable service configuration. These packages will install nad in `/opt/circonus` and configure and start nad as a service.

At the time of this writing, these are:

* deb packages - Ubuntu: 14.04, 16.04
* rpm packages - CentOS: EL6, EL7

An up-to-date list of currently supported platforms is available from [COSI](https://onestep.circonus.com/) [in JSON format].

## Source Install

### Build requirements

* NodeJS v4.4.5+ must be installed and available as `node` on the PATH.
* A basic development environment (compiler, GNU make, etc.) in order to build certain plugins. For OmniOS/FreeBSD/etc. you must install and use `gmake`.

### Basic `install` target

A basic install from source will install nad in `/opt/circonus`.

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

In addition to the basic `install` target, there are OS-specific installation targets. Which will build OS-specific plugins, enable default plugins, and install an OS-specific service configuration.

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
* OpenBSD - manual service configuration/installation required by user

# Options

Options should be added to the `NAD_OPTS` variable in `/opt/circonus/etc/nad.conf`.

| Option                    | Description |
| ---                       | ---         |
| **<a name="opt_general">General</a>** ||
| `--plugin_dir <dir>`      | Plugin directory. Default: `/opt/circonus/etc/node-agent.d` |
| `-p, --listen <spec>`     | Listening IP address and port. (`ip`\|`port`\|`ip:port`) Default: 2609 |
| `--no-statsd`             | Disable built-in StatsD interface. Default is enabled |
| `--statsd_config <file>`  | Configuration file for StatsD interface. No default |
| **<a name="opt_reverse">Reverse</a>**              ||
| `-r, --reverse`           | Use reverse connection to broker. Default: false |
| `--cid <cid>`             | Check bundle ID for reverse connection. No default |
| `--broker_ca <file>`      | CA file for broker reverse connection. No default |
| `--target <target>`       | Target host -- see [Target](#target) below. Default: `os.hostname()` |
| **<a name="opt_api">API</a>**                  ||
| `--api_key <key>`         | Circonus API Token key. No default |
| `--api_app <app>`         | Circonus API Token app. Default: nad |
| `--api_url <url>`         | Circonus API URL. Default: `https://api.circonus.com/v2/` |
| `--api_ca <file>`         | CA file for API URL. No default |
| **<a name="opt_ssl">SSL</a>**                  ||
| `-s, --ssl_listen <spec>` | SSL listening IP address and port. (`ip`\|`port`\|`ip:port`) No default |
| `--ssl_cert <file>`       | SSL certificate PEM file, required for SSL. Default: `<plugin_dir>/na.crt`|
| `--ssl_key <file>`        | SSL certificate key PEM file, required for SSL. Default: `<plugin_dir>/na.key` |
| `--ssl_ca <file>`         | SSL CA certificate PEM file, required for SSL w/verify. Default: `<plugin_dir>/na.ca` |
| `-v, --ssl_verify`        | Verify SSL traffic. Default: false |
| **<a name="opt_misc">Miscellaneous</a>**        ||
| `-u, --uid <id>`          | User id to drop privileges to on start. Default: `nobody` |
| `-g, --gid <id>`          | Group id to drop privileges to on start. Default: `nobody` |
| `--loglevel <level>`      | Log level (trace, debug, info, warn, error, fatal). Default: info |
| `-d, --debug`             | Enable debug logging (verbose). Default: false |
| `-t, --trace`             | Enable trace logging (very verbose). Default: false |
| `--no_watch`              | Disable automatic watches plugin_dir and files. SIGHUP to force rescan. Default: false |
| `-h, --help`              | Output usage information and exit. |
| `-V, --version`           | Output the version number and exit. |
| `--debugdir`              | Create debug files for each plugin and write to this directory. No default |
| `--wipedebugdir`          | Wipe debug directory clean before each write. Default: false |
| `-i, --inventory`         | Offline inventory and exit. |
| **Self-configure**       ||
| `--hostname <host>`       | Hostname self-configure to use in check and graph names. Default: `os.hostname()` |
| `--brokerid <id>`         | Broker ID for self-configure to use for creating check. No default |
| `--configfile <file>`     | File in plugin_dir for self-configure. No default |
| **DEPRECATED**           ||
| `-c <dir>`                | DEPRECATED use --plugin_dir |
| `--authtoken <token>`     | DEPRECATED use --api_key |
| `--apihost <host>`        | DEPRECATED use --api_url |
| `--apiport <port>`        | DEPRECATED use --api_url |
| `--apipath <path>`        | DEPRECATED use --api_url |
| `--apiprotocol <proto>`   | DEPRECATED use --api_url |
| `--apiverbose`            | DEPRECATED NOP, see --debug |
| `--sslcert <file>`        | DEPRECATED use --ssl_cert |
| `--sslkey <file>`         | DEPRECATED use --ssl_key |
| `--sslca <file>`          | DEPRECATED use --ssl_ca |
| `--cafile <file>`         | DEPRECATED use --broker_ca |

## Target

Is used by both Reverse and Self-configure.
1. Reverse will use it to search for a check if a cid is not provided and cosi was not used to setup the host.
1. Self-configure will use it to configure the check on the broker - it is the host (IP or FQDN) the broker will connect to in order to pull metrics.

## Reverse mode

### Required:

* `--reverse` flag signals nad to setup a reverse connection to the broker.

### Optional:

* `--api_key` - if not provided, will pull from cosi if available or fail.
* `--target` - to enable searching for a check (e.g. on a host not registered by cosi).
* `--cid` - will pull from cosi if available (and `--target` not specified).

## StatsD

See https://github.com/circonus-labs/nad/lib/statsd/README.md for details on configuring the statsd interface.

## Self-configure

**DEPRECATED** -- use of cosi is advised  (https://github.com/circonus-labs/circonus-one-step-install)

Providing an API token key without the reverse flag will initiate a self-configuration attempt.

### Required:

* `--api_key`
* `--target`
* `--brokerid`
* `--configfile`

### Optional:

* `--hostname`

# Plugins

NAD plugins are located in the plugin directory (default: `/opt/circonus/etc/node-agent.d`). If the automated or manual install were used the plugins specific to the current OS are already built. If the source installation method was used - change to the appropriate directory for the current OS and run `make` or `gmake` to build the plugins.

## Enabling

When NAD starts it scans the top-level plugin directory (default: `/opt/circonus/etc/node-agent.d`) for plugins to enable. Rudimentary filters are used to determine what is a plugin and what is not. e.g. entry is not a directory, entry has a name in the format `name.ext`, entry is executable, etc. Additionally, any directory entries ending in `.json` or `.conf` are deemed to be configuration files and ignored when scanning for plugins.

To enable a plugin from one of the sub-directories in the top-level plugin directory, simply create a symlink (soft) from the plugin script into the main plugin directory. (e.g. `cd /opt/circonus/etc/node-agent.d && ln -s linux/vm.sh .`) The plugin will be automatically found and loaded if file watching is enabled (the default). If file watches are disabled, send a `SIGHUP` to force a rescan.

## Disabling

Removing the symlink from the top-level plugin directory will disable the plugin. If file watches are disabled, send a `SIGHUP` to force a rescan.

## Verify

The output from a plugin can be verified/inspected at any time by making a request for that specific plugin:

`curl http://localhost:2609/run/name`

where `name` is the name of the plugin without the extension. NAD will respond with the metrics from that plugin in JSON format.

## Inventory

The currently loaded plugin inventory can be seen by making a request to the `inventory` endpoint.

`curl http://localhost:2609/inventory`

NAD will respond with a list of the currently loaded plugins. The `inventory` endpoint supports one argument, `?full`, which includes additional details on each plugin.

## Custom

For information on creating custom plugins see the Plugin section of [DEVELOPMENT.md](DEVELOPMENT.md#plugins).
