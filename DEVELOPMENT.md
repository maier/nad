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

At the time of this writing, development host environment:

```sh
$  echo $(system_profiler SPSoftwareDataType | grep 'System Version' | cut -d ':' -f 2) ; vagrant -v ; vboxmanage --version
macOS 10.12.4 (16E195)
Vagrant 1.9.2
5.1.18r114002
```

# Core

1. Fork [NAD repository on github](https://github.com/circonus-labs/nad)
1. Clone your fork on development host
1. `vagrant up <os>` where `<os>` is the type of OS to target from above
1. `vagrant ssh <os>`
1. `cd /vagrant && make install`
1. `/opt/circonus/nad`
1. In another terminal, `vagrant ssh <os> -c 'curl http://127.0.0.1:2609/'`

## Building custom omnibus packages

1. Clone your fork
1. Update `packaging/make-omnibus`, change `NAD_REPO` to point to the fork URL
1. `vagrant up` the target os
1. `vagrant ssh` into the target os vm
1. `cd /vagrant/packaging && ./make-omnibus`

## Working on a custom NAD fork

1. Clone your fork
1. When you're done developing on your target host commit and push to your fork
1. `vagrant up` the target os
1. `vagrant ssh` into the target os vm
1. `cd /vagrant/packaging && ./make-omnibus`

## If a specific branch is needed

The target os build vm will need to be primed with the specific branch.

For example, after `vagrant ssh <os>`:

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

# Plugins
