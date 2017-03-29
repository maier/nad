# NAD development

# Environment

A [Vagrantfile](Vagrantfile) is provided with current OS targets.

* `vagrant up c7` CentOS 7.3.1611 x86_64
* `vagrant up c6` CentOS 6.8 x86_64
* `vagrant up u16` Ubuntu 16.04 (xenial) x86_64
* `vagrant up u14` Ubuntu 14.04 (trusty) x86_64
* `vagrant up o14` OmniOS r151014
* `vagrant up bsd11` FreeBSD 11.0-RELEASE-p1
* `vagrant up bsd10` FreeBSD 10.3-RELEASE

Deprecated, no longer supported/built:

* 3/31/2017 - CentOS 5 end of life
* 4/2017 - Ubuntu 12.04 (precise) end of life

Development host environment (at the time of this writing):

```sh
$  echo $(system_profiler SPSoftwareDataType | grep 'System Version' | cut -d ':' -f 2) ;\
   vagrant -v ; vboxmanage --version ; node -v ; eslint -v
macOS 10.12.4 (16E195)
Vagrant 1.9.2
5.1.18r114002
v6.10.1
v3.18.0
```

# Core

1. Fork the [NAD repository on github](https://github.com/circonus-labs/nad)
1. Clone fork on development host
1. `vagrant up <target_os>` where `<target_os>` is the desired OS from the list above
1. `vagrant ssh <target_os>`
1. `cd /vagrant && make install`
1. `/opt/circonus/nad`
1. In another terminal, `vagrant ssh <target_os> -c 'curl http://127.0.0.1:2609/'`

## Building a custom omnibus package

The `packaging/make-omnibus` shell script is used to build the omnibus packages. The build can be customized by copying `example-omnibus.conf` to `omnibus.conf` and setting the applicable variables. `make-omnibus` will clone its own copy of the repository so, ensure changes are committed and pushed to the fork represented in `NAD_REPO`.

1. Clone fork
1. Copy `packaging/example-omnibus.conf` to `packaging/omnibus.conf` and customize
    1. Ensure `NAD_REPO` is set to the fork's clone URL in `packaging/omnibus.conf`
    1. *If working on a custom feature branch*, ensure `NAD_BRANCH` is set to the correct branch in `packaging/omnibus.conf`
1. `vagrant up <target_os>`
1. `vagrant ssh <target_os>`
1. `cd /vagrant/packaging && ./make-omnibus`
1. The result should be an installable omnibus package in `PUBLISHDIR` (as set in `omnibus.conf`)

## Testing

* Live testing can be performed by developing on host and running `make install` in guest VM.
* Run NAD in the foreground with debugging. `/opt/circonus/sbin/nad --debug`
* Leverage `curl` to simulate requests. `curl 'http://127.0.0.1:2609/'`
* If working on an executable plugin, ensure the plugin works from the command line first.

# Plugins

NAD uses a *plugin* system for gathering metrics. NAD supports two primary types of plugins - **executable** and **native**. Each type of plugin produces output that NAD consumes and makes available to Circonus. NAD/Circonus support several *types* of metrics.

## Metric types

* `i` - a signed 32bit integer value,
* `I` - an unsigned 32bit integer value,
* `l` - a signed 64bit integer value,
* `L` - an unsigned 64bit integer value,
* `n` - a value to be represented as a double, or
* `s` - the the value is a string.


## Executable plugins

An executable can be a shell script, perl/python/ruby/etc. script, a compiled binary, etc. Anything that one can *run* from the command line. See the [plugins](plugins/) directory for examples of several types of executable plugins. Executables must produce metrics to standard output. They may produce JSON or tab-delimited output.  


### Tab-delimited output format

* `<metric_name>\t<metric_type>` - the specified metric has a null value.
* `<metric_name>\t<metric_type>\t<value>` - the specified metric has a value.

### JSON output format

```json
{ "<metric_name>": { "_type": "<metric_type>", "_value": <value> } }
```

Example:

```json
{ "my_metric": { "_type": "i", "_value": 10 }, "cherry\`pi": { "_type": "n", "_value": 3.14 } }
```

### Control Information

An executable plugin may provide control information in a line starting with a `#` character followed by a JSON block. Currently, `timeout` is the only parameter accepted and the argument is interpreted as seconds. For example, to indicate that the script should be aborted if a set of output metrics cannot be completed in 1.12 seconds, the plugin would emit:

`# { "timeout": 1.12 }`

### Continuous Output

Continuous output is supported for long-running executables. After a set of metrics is emitted to standard output, emit a single empty line. NAD will accept the previous output into a result set and return them on the next request for metrics. The executable can then pause for some ad-hoc amount of time and produce more output followed by another empty line. This mode can be useful for collection of information from tools such as `mpstat` or `vmstat`.

> Note: in most cases if you can get raw accumulated counters (instead of averages over some amount of time), that the output can be more useful to monitoring applications as a derivative can be applied after the fact without the risk of data loss.

## Native plugins

 A native plugin is a NodeJS module which will be loaded into NAD. See [native example](examples/plugins/native), additionally, there are several native plugins in the [plugins](plugins/) directory.

 1. Written as a nodejs module
 1. Expose a `run()` method which will be passed five arguments.
     1. The plugin definition object
     1. A callback function
     1. The incoming request which fired the plugin
     1. The plugin arguments (as an object), if there are any
     1. The plugin instance ID
 1. The `run()` method is responsible for calling the callback with three arguments
     1. The plugin definition object (which was passed to the `run()` method)
     1. The metrics (as an object)
     1. The instance ID (which was passed to the `run()` method)
 1. Additionally, the `run()` method should set its plugin definition object property `running` to false when done. (`def.running = false;`)

### Native plugin metric object

```js
{
    <metric_name>: {
        _type: "<metric_type>",
        _value: <metric_value>
    }
}
```

Example:

```js
{
    my_metric: {
        _type: "i",
        _value: 10
    }
}
```


## Creating a new plugin

1. Create a directory for plugin. `mkdir /opt/circonus/etc/node-agent.d/my_plugin && cd /opt/circonus/etc/node-agent.d/my_plugin`
1. Write plugin, running from command line during development (for an executable)
1. When ready to test plugin create symlink in parent directory `ln -s my_plugin.sh ..`
