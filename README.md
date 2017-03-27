# NAD - Node Agent Daemon

* [Installation](#installation)
  * [Automated](#automated-install) recommended
  * [Manual](#manual-install)
  * [Source](#source-install)
* [Plugins](PLUGINS.md)
* [Operations](OPERATIONS.md)
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
