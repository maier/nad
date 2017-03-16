# nad(8) -- Node Agent Daemon


## SYNOPSIS

`nad [options]`

## DESCRIPTION

The node agent daemon (NAD) provides a simple mechanism to expose systems and application metrics to external onlookers. It inventories all executable programs/scripts in the *plugin directory* and executes them upon external request (via http or https) and returns the results in JSON format.

It is recommended that executables be stored in subdirectories of the *plugin directory*.  Because those subdirectories are not scanned, those executables will not be executed without an additional step.  Those executables that the administrator wishes activated can be soft linked directly within the *plugin directory*.

No arguments are accepted from the onlooker and thus no special precautions must be taken handling/validating/sanitizing arguments.

The daemon provides several locations for information:

### `/` and `/run`
cause execution and consolidation of all plugins and their output.

### `/run/plugin`
causes the execution of a single plugin (minus the extension on script if it exists)

### `/inventory`
returns the current active inventory of plugins.

### `/inventory?full`
returns the current active inventory of plugins with full details for each plugin.

## OPTIONS

```
   -h, --help                          output usage information
   -V, --version                       output the version number
   --plugin_dir <dir>                  Plugin directory [/opt/circonus/etc/node-agent.d]
   -p, --listen <ip|port|ip:port>      Listening IP address and port [2609]
   -r, --reverse                       Use reverse connection to broker [false]
   --cid <cid>                         Check bundle id for reverse connection []
   --broker_ca <file>                  CA file for broker reverse connection []
   --api_key <key>                     Circonus API Token key []
   --api_app <app>                     Circonus API Token app [nad]
   --api_url <url>                     Circonus API URL [https://api.circonus.com/v2/]
   --api_ca <file>                     CA file for API URL []
   --hostname <host>                   Hostname self-configure to use in check and graph names [os.hostname()]
   --brokerid <id>                     Broker ID for self-configure to use for creating check []
   --configfile <file>                 File in plugin_dir for self-configure []
   --target <target>                   Target host [os.hostname()] -- see Target below
   -s, --ssl_listen <ip|port|ip:port>  SSL listening IP address and port []
   --ssl_cert <file>                   SSL certificate PEM file, required for SSL [<plugin_dir>/na.crt]
   --ssl_key <file>                    SSL certificate key PEM file, required for SSL [<plugin_dir>/na.key]
   --ssl_ca <file>                     SSL CA certificate PEM file, required for SSL w/verify [<plugin_dir>/na.ca]
   -v, --ssl_verify                    Verify SSL traffic [false]
   -u, --uid <id>                      User id to drop privileges to on start []
   --loglevel <level>                  Log level (trace|debug|info|warn|error|fatal) [info]
   -d, --debug                         Enable debug logging (verbose) [false]
   -t, --trace                         Enable trace logging (very verbose) [false]
   --no_watch                          Disable automatic watches of plugin directory, script files, config files. Send SIGHUP to rescan plugins. [true]
   --debugdir                          Create debug files for each plugin and write to this directory []
   --wipedebugdir                      Wipe debug directory clean before each write [false]
   -i, --inventory                     Offline inventory
   -c <dir>                            DEPRECATED use --plugin_dir
   --authtoken <token>                 DEPRECATED use --api_key
   --apihost <host>                    DEPRECATED use --api_url
   --apiport <port>                    DEPRECATED use --api_url
   --apipath <path>                    DEPRECATED use --api_url
   --apiprotocol <proto>               DEPRECATED use --api_url
   --apiverbose                        DEPRECATED NOP, see --debug
   --sslcert <file>                    DEPRECATED use --ssl_cert
   --sslkey <file>                     DEPRECATED use --ssl_key
   --sslca <file>                      DEPRECATED use --ssl_ca
   --cafile <file>                     DEPRECATED use --broker_ca

Target

   Is used by both Reverse and Self-configure.
       Reverse will use it to search for a check if a cid is not provided.
       Self-configure will use it to configure the check on the broker - it is
       the host the broker will connect to in order to pull metrics.

Reverse mode
   Required:
       --reverse flag signals nad to setup a reverse connection to the broker.
   Optional:
       --api_key - will pull from cosi if available or fail if not provided.
       --target - to enable searching for a check (e.g. on a host not registered by cosi).
       or
       --cid - will pull from cosi if available (and --target not specified).

StatsD
   See https://github.com/circonus-labs/nad/lib/statsd/README.md
   for details on configuring the statsd interface.

Self-configure
   DEPRECATED -- use cosi instead (https://github.com/circonus-labs/circonus-one-step-install)

   Providing an API token key without the reverse flag will initiate a self-configuration attempt.

   Required:
       --api_key
       --target
       --brokerid
       --configfile
   Optional:
       --hostname
```

## SCRIPT OUTPUT
The executables placed in the *plugin directory* must produce metrics to standard output. They may produce JSON output.  Alternatively, the may produce simple tab-separated metric output that adheres to the following format.

### metric_name\[TAB\]metric_type
Indicating the the metric specified has a null value.

### metric_name\[TAB\]metric_type\[TAB\]value
Indicating the the metric specified has value

### The metric_type
* i - indicating a signed 32bit integer value,
* I - indicating an unsigned 32bit integer value,
* l - indicating a signed 64bit integer value,
* L - indicating an unsigned 64bit integer value,
* n - indicating a value to be represented as a double, or
* s - indicating the the value is a string.

### Control Information
You may provide control information in a line starting with a `#` character and followed by a JSON block.  Currently, timeout is the only  parameter accepted and the argument is interpreted as seconds.  For example, to indicate that the script should be aborted if a set of output metrics cannot be completed in 1.12 seconds:

\# { "timeout": 1.12 }

### Continuous Output
Continuous output is supported by long-running scripts.  After a set of metrics is emitted to standard output, emit a single empty line. NAD  will accept the previous metrics into a result set and return them on the next request for data.  The program can then pause for some ad-hoc amount of time and produce another set of metrics followed by a blank line.

This mode can be useful for collection information such as `mpstat` or `vmstat` information.

Note, that in most cases if you can get raw accumulated counters (instead of averages over some amount of time), that the output can be more useful to monitoring applications as a derivative can be applied after the fact without the risk of data loss.

###   JSON format

If you elect to product JSON formatted output in your programs, you must provide a JSON object whose keys have values that look so:

{ "\_type": <metric_type>, "\_value": "yourvalue" }

## BUGS

https://github.com/circonus-labs/nad/issues

## AUTHOR
Circonus, Inc. <support@circonus.com>

## COPYRIGHT
Copyright &copy; 2017, Circonus, Inc.
