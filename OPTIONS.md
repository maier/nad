# NAD Options

## Usage

`nad [options]`

## Configuration

The nad configuration is contained in `/opt/circonus/etc/nad.conf`, see [OPTIONS](OPTIONS.md) for details on the various command line options which can be used to customize nad.

| Option                    | Description |
| ---                       | ---         |
| **General** ||
| `--plugin_dir <dir>`      | Plugin directory. Default: `/opt/circonus/etc/node-agent.d` |
| `-p, --listen <spec>`     | Listening IP address and port. (`ip`\|`port`\|`ip:port`) Default: 2609 |
| `--no-statsd`             | Disable built-in StatsD interface. Default is enabled |
| `--statsd_config <file>`  | Configuration file for StatsD interface. No default |
| **Reverse**              ||
| `-r, --reverse`           | Use reverse connection to broker. Default: false |
| `--cid <cid>`             | Check bundle ID for reverse connection. No default |
| `--broker_ca <file>`      | CA file for broker reverse connection. No default |
| `--target <target>`       | Target host -- see Target below. Default: `os.hostname()` |
| **API**                  ||
| `--api_key <key>`         | Circonus API Token key. No default |
| `--api_app <app>`         | Circonus API Token app. Default: nad |
| `--api_url <url>`         | Circonus API URL. Default: `https://api.circonus.com/v2/` |
| `--api_ca <file>`         | CA file for API URL. No default |
| **SSL**                  ||
| `-s, --ssl_listen <spec>` | SSL listening IP address and port. (`ip`\|`port`\|`ip:port`) No default |
| `--ssl_cert <file>`       | SSL certificate PEM file, required for SSL. Default: `<plugin_dir>/na.crt`|
| `--ssl_key <file>`        | SSL certificate key PEM file, required for SSL. Default: `<plugin_dir>/na.key` |
| `--ssl_ca <file>`         | SSL CA certificate PEM file, required for SSL w/verify. Default: `<plugin_dir>/na.ca` |
| `-v, --ssl_verify`        | Verify SSL traffic. Default: false |
| **Miscellaneous**        ||
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
