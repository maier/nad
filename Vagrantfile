# -*- mode: ruby -*-
# vi: set ft=ruby :
# rubocop:disable Metrics/LineLength
# rubocop:disable Metrics/BlockLength

#
# defines VMs for testing builds
#

Vagrant.configure('2') do |config|
    config.vm.define 'o14', autostart: false do |o14|
        o14.vm.box = 'maier/omnios-r151014-x86_64'
    end

    config.vm.define 'c7', autostart: false do |c7|
        c7.vm.box = 'maier/centos-7.2.1511-x86_64'
        c7.vm.provision 'shell', inline: <<-SHELL
            yum -q -e 0 makecache fast
            yum -q install -y git

            echo "[credential]" > /home/vagrant/.gitconfig
            echo "    helper = cache --timeout=3600" >> /home/vagrant/.gitconfig
            chown vagrant:vagrant /home/vagrant/.gitconfig
            chmod 600 /home/vagrant/.gitconfig
        SHELL
    end

    config.vm.define 'u16', autostart: false do |u16|
        u16.vm.box = 'ubuntu/xenial64'
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
end
