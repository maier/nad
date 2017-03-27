# NAD - Node Agent Daemon
* [Overview](#overview)
  * [Features](#features)
* [Installation](#installation)
  * [Automated](#automated-install) *recommended*
  * [Manual](#manual-install)
  * [Source](#source-install)
* [Operating and running](OPERATIONS.md)
  * [Configuration options](OPTIONS.md)
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


### OS service configurations

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
