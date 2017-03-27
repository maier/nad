# NAD Options

## Usage

`nad [options]`

## Configuration

The nad configuration is contained in `/opt/circonus/etc/nad.conf`, see [OPTIONS](OPTIONS.md) for details on the various command line options which can be used to customize nad.

| Option                        | Description |
| ---                           | ---         |
| **General** ||
| `--plugin_dir <dir>`          | Plugin directory. Default: `/opt/circonus/etc/node-agent.d` |
| `-p, --listen <spec>`         | Listening IP address and port, spec can be an `ip` or a `port` or an `ip:port` specification. Default: 2609 |
| `--no-statsd`                 | Disable built-in StatsD interface. Default is enabled |
| `--statsd_config <file>`      | Configuration file for StatsD interface. No default |


| Option                    | Default                          | Description                                              |
| ------------------------- | -------------------------------- | -------------------------------------------------------- |
| **Reverse**              ||
| `-r, --reverse`           | false                            | Use reverse connection to broker |
| `--cid <cid>`             |                                  | Check bundle ID for reverse connection |
| `--broker_ca <file>`      |                                  | CA file for broker reverse connection |
| `--target <target>`       | `os.hostname()`                  | Target host -- see Target below |
| **API**                  ||
| `--api_key <key>`         |                                  | Circonus API Token key |
| `--api_app <app>`         | nad                              | Circonus API Token app |
| `--api_url <url>`         | `https://api.circonus.com/v2/`   | Circonus API URL |
| `--api_ca <file>`         |                                  | CA file for API URL |
| **SSL**                  ||
| `-s, --ssl_listen <spec>` |                                  | SSL listening IP address and port, spec can be `ip` or `port` or `ip:port` |
| `--ssl_cert <file>`       | `<plugin_dir>/na.crt`            | SSL certificate PEM file, required for SSL |
| `--ssl_key <file>`        | `<plugin_dir>/na.key`            | SSL certificate key PEM file, required for SSL |
| `--ssl_ca <file>`         | `<plugin_dir>/na.ca`             | SSL CA certificate PEM file, required for SSL w/verify |
| `-v, --ssl_verify`        | false                            | Verify SSL traffic |
| **Miscellaneous**        ||
| `-u, --uid <id>`          | `nobody`                         | User id to drop privileges to on start (emit warning and ignore on non-POSIX) |
| `-g, --gid <id>`          | `nobody`                         | Group id to drop privileges to on start (emit warning and ignore on non-POSIX) |
| `--loglevel <level>`      | info                             | Log level (trace, debug, info, warn, error, fatal) |
| `-d, --debug`             | false                            | Enable debug logging (verbose) |
| `-t, --trace`             | false                            | Enable trace logging (very verbose) |
| `--no_watch`              | false                            | Disable automatic watches of plugin directory, script files, config files. Send SIGHUP to rescan plugins |
| `-h, --help`              |                                  | output usage information |
| `-V, --version`           |                                  | output the version number |
| `--debugdir`              |                                  | Create debug files for each plugin and write to this directory |
| `--wipedebugdir`          | false                            | Wipe debug directory clean before each write |
| `-i, --inventory`         |                                  | Offline inventory |
| **Self-configure**       ||
| `--hostname <host>`       | `os.hostname()`                  | Hostname self-configure to use in check and graph names |
| `--brokerid <id>`         |                                  | Broker ID for self-configure to use for creating check |
| `--configfile <file>`     |                                  | File in plugin_dir for self-configure |
| **DEPRECATED**           ||
| `-c <dir>`                |                                  | DEPRECATED use --plugin_dir |
| `--authtoken <token>`     |                                  | DEPRECATED use --api_key |
| `--apihost <host>`        |                                  | DEPRECATED use --api_url |
| `--apiport <port>`        |                                  | DEPRECATED use --api_url |
| `--apipath <path>`        |                                  | DEPRECATED use --api_url |
| `--apiprotocol <proto>`   |                                  | DEPRECATED use --api_url |
| `--apiverbose`            |                                  | DEPRECATED NOP, see --debug |
| `--sslcert <file>`        |                                  | DEPRECATED use --ssl_cert |
| `--sslkey <file>`         |                                  | DEPRECATED use --ssl_key |
| `--sslca <file>`          |                                  | DEPRECATED use --ssl_ca |
| `--cafile <file>`         |                                  | DEPRECATED use --broker_ca |

## Target

Is used by both Reverse and Self-configure.
1. Reverse will use it to search for a check if a cid is not provided.
1. Self-configure will use it to configure the check on the broker - it is the host the broker will connect to in order to pull metrics.

## Reverse mode

### Required:

* `--reverse` flag signals nad to setup a reverse connection to the broker.

### Optional:

* `--api_key` - will pull from cosi if available or fail if not provided.
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
