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

Development host environment (at the time of this writing):

```sh
$  echo $(system_profiler SPSoftwareDataType | grep 'System Version' | cut -d ':' -f 2) ; vagrant -v ; vboxmanage --version
macOS 10.12.4 (16E195)
Vagrant 1.9.2
5.1.18r114002
```

# Core

1. Fork [NAD repository on github](https://github.com/circonus-labs/nad)
1. Clone fork on development host
1. `vagrant up <os>` where `<os>` is the type of OS to target from above
1. `vagrant ssh <os>`
1. `cd /vagrant && make install`
1. `/opt/circonus/nad`
1. In another terminal, `vagrant ssh <os> -c 'curl http://127.0.0.1:2609/'`

## Building custom omnibus packages

1. Clone fork
1. Ensure `NAD_REPO` in `packaging/make-omnibus` points to clone URL
1. `vagrant up <target_os>`
1. `vagrant ssh <target_os>`
1. `cd /vagrant/packaging && ./make-omnibus`
1. The result should be an installable omnibus package in `/mnt/node-agent/packages`

## If a specific branch is needed

The target os build vm will need to be primed with the specific branch.

For example, after `vagrant ssh <target_os>`:

```sh
mkdir -p /tmp/nad-omnibus-build
pushd /tmp/nad-omnibus-build
git clone https://github.com/your_github_user_name/nad
cd nad
git checkout cool_new_feature_branch
popd
cd /vagrant/packaging
./make-omnibus
```

## Testing

* Live testing can be performed by developing on host and running `make install` in guest VM.
* Run NAD in the foreground with debug. `/opt/circonus/sbin/nad --debug`
* Leverage `curl` to simulate requests. `curl 'http://127.0.0.1:2609/'`

# Plugins

NAD supports two primary types of plugins - executables and native. An executable can be a shell script, perl/python/ruby/etc. script, a compiled binary, etc. A native plugin is a nodejs module which will be loaded into NAD.

## Executable plugin output

See [script example](examples/plugins/script)

Executables must produce metrics to standard output. They may produce JSON or tab-delimited output.  

### Tab-delimited format

* `<metric_name>\t<metric_type>` - the specified metric has a null value.
* `<metric_name>\t<metric_type>\t<value>` - the specified metric has a value.

### JSON format

If you elect to product JSON formatted output in your programs, you must provide a JSON object whose keys have values that look so:

```json
{ "<metric_name>": { "_type": "<metric_type>", "_value": <value> } }
```

Example:

```json
{ "my_metric": { "_type": "i", "_value": 10 } }
```

### The `<metric_type>`

* `i` - a signed 32bit integer value,
* `I` - an unsigned 32bit integer value,
* `l` - a signed 64bit integer value,
* `L` - an unsigned 64bit integer value,
* `n` - a value to be represented as a double, or
* `s` - the the value is a string.

### Control Information

You may provide control information in a line starting with a `#` character and followed by a JSON block.  Currently, `timeout` is the only  parameter accepted and the argument is interpreted as seconds.  For example, to indicate that the script should be aborted if a set of output metrics cannot be completed in 1.12 seconds:

`# { "timeout": 1.12 }`

### Continuous Output

Continuous output is supported by long-running scripts.  After a set of metrics is emitted to standard output, emit a single empty line. NAD  will accept the previous metrics into a result set and return them on the next request for data.  The program can then pause for some ad-hoc amount of time and produce another set of metrics followed by a blank line.

This mode can be useful for collection information such as `mpstat` or `vmstat` information.

Note, that in most cases if you can get raw accumulated counters (instead of averages over some amount of time), that the output can be more useful to monitoring applications as a derivative can be applied after the fact without the risk of data loss.


## Creating a new plugin

1. Create a directory for plugin. `mkdir /opt/circonus/etc/node-agent.d/my_plugin && cd /opt/circonus/etc/node-agent.d/my_plugin`
1. Write plugin script, running from command line during development
1. When ready to test plugin create symlink in parent directory `ln -s my_plugin.sh ..`


## Native plugins

See [native example](examples/plugins/native)

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