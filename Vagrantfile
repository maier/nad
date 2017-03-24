# -*- mode: ruby -*-
# vi: set ft=ruby :
# rubocop:disable Metrics/BlockLength

#
# defines VMs for testing builds
#

node_ver = '6.10.1'

Vagrant.configure('2') do |config|
    config.vm.define 'c7', autostart: false do |c7|
        c7.vm.box = 'maier/centos-7.3.1611-x86_64'
        c7.vm.provision 'shell', inline: <<-SHELL
            yum -q -e 0 makecache fast
            echo "Installing needed packages"
            yum -q install -y rsync gcc
            node_tgz="node-v#{node_ver}-linux-x64.tar.gz"
            [[ -f /vagrant/${node_tgz} ]] || {
                echo "Fetching $node_tgz"
                curl -sSL "https://nodejs.org/dist/v#{node_ver}/${node_tgz}" -o /vagrant/$node_tgz
            }
            [[ -x /opt/circonus/bin/node ]] || {
                echo "Installing $node_tgz"
                [[ -d /opt/circonus ]] || mkdir -p /opt/circonus
                tar --strip-components=1 -zxf /vagrant/$node_tgz -C /opt/circonus
            }
        SHELL
    end

    config.vm.define 'c6', autostart: false do |c6|
        c6.vm.box = 'maier/centos-6.8-x86_64'
        c6.vm.provision 'shell', inline: <<-SHELL
            yum -q -e 0 makecache fast
            echo "Installing needed packages"
            yum -q install -y rsync gcc
            node_tgz="node-v#{node_ver}-linux-x64.tar.gz"
            [[ -f /vagrant/${node_tgz} ]] || {
                echo "Fetching $node_tgz"
                curl -sSL "https://nodejs.org/dist/v#{node_ver}/${node_tgz}" -o /vagrant/$node_tgz
            }
            [[ -x /opt/circonus/bin/node ]] || {
                echo "Installing $node_tgz"
                [[ -d /opt/circonus ]] || mkdir -p /opt/circonus
                tar --strip-components=1 -zxf /vagrant/$node_tgz -C /opt/circonus
            }
        SHELL
    end

    config.vm.define 'u16', autostart: false do |u16|
        u16.vm.box = 'maier/ubuntu-16.04-x86_64'
        # prevent 'mesg: ttyname failed: Inappropriate ioctl for device' errors
        u16.ssh.shell = "bash -c 'BASH_ENV=/etc/profile exec bash'"
        u16.vm.provider 'virtualbox' do |vb|
            vb.name = 'u16'
            # disable creation of the boot console log in host's directory
            vb.customize ['modifyvm', :id, '--uartmode1', 'disconnected']
        end
        u16.vm.provision 'shell', inline: <<-SHELL
            apt-get install -y -q git

            echo "[credential]" > /home/ubuntu/.gitconfig
            echo "    helper = cache --timeout=3600" >> /home/ubuntu/.gitconfig
            chown ubuntu:ubuntu /home/ubuntu/.gitconfig
            chmod 600 /home/ubuntu/.gitconfig
        SHELL
    end

    config.vm.define 'u14', autostart: false do |u14|
        u14.vm.box = 'maier/ubuntu-14.04-x86_64'
        # prevent 'mesg: ttyname failed: Inappropriate ioctl for device' errors
        u14.ssh.shell = "bash -c 'BASH_ENV=/etc/profile exec bash'"
        u14.vm.provider 'virtualbox' do |vb|
            vb.name = 'u14'
            # disable creation of the boot console log in host's directory
            vb.customize ['modifyvm', :id, '--uartmode1', 'disconnected']
        end
        u14.vm.provision 'shell', inline: <<-SHELL
            apt-get install -y -q git

            echo "[credential]" > /home/ubuntu/.gitconfig
            echo "    helper = cache --timeout=3600" >> /home/ubuntu/.gitconfig
            chown ubuntu:ubuntu /home/ubuntu/.gitconfig
            chmod 600 /home/ubuntu/.gitconfig
        SHELL
    end

    config.vm.define 'o14', autostart: false do |o14|
        o14.vm.box = 'maier/omnios-r151014-x86_64'
        o14.vm.provision 'shell', inline: <<-SHELL
            pkg install git

            echo "[credential]" > /home/vagrant/.gitconfig
            echo "    helper = cache --timeout=3600" >> /home/vagrant/.gitconfig
            chown vagrant:vagrant /home/vagrant/.gitconfig
            chmod 600 /home/vagrant/.gitconfig
        SHELL
    end

    config.vm.define 'bsd11', autostart: false do |bsd11|
        bsd11.vm.box = 'freebsd/FreeBSD-11.0-RELEASE-p1'
        bsd11.vm.provision 'shell', inline: <<-SHELL
            pkg install git

            echo "[credential]" > /home/vagrant/.gitconfig
            echo "    helper = cache --timeout=3600" >> /home/vagrant/.gitconfig
            chown vagrant:vagrant /home/vagrant/.gitconfig
            chmod 600 /home/vagrant/.gitconfig
        SHELL
    end

    config.vm.define 'bsd10', autostart: false do |bsd10|
        bsd10.vm.box = 'freebsd/FreeBSD-10.3-RELEASE'
        bsd10.vm.provision 'shell', inline: <<-SHELL
            pkg install git

            echo "[credential]" > /home/vagrant/.gitconfig
            echo "    helper = cache --timeout=3600" >> /home/vagrant/.gitconfig
            chown vagrant:vagrant /home/vagrant/.gitconfig
            chmod 600 /home/vagrant/.gitconfig
        SHELL
    end
end
