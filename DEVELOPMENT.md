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

1. Create a directory for plugin. `mkdir /opt/circonus/etc/node-agent.d/my_plugin && cd /opt/circonus/etc/node-agent.d/my_plugin`
1. Write plugin script, running from command line during development
1. When ready to test plugin create symlink in parent directory `ln -s my_plugin.sh ..`

NAD supports two primary types of plugins - executables and native. An executable can be a shell script, perl/python/ruby script, a compiled binary, etc. A native plugin is a nodejs module which will be loaded into NAD. A native plugin must adhere to a few basics.

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
