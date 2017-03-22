#!/usr/bin/env bash
set -u
set -e

nad_dir="@@PREFIX@@"

node_bin="${nad_dir}/bin/node"
nad_script="${nad_dir}/sbin/nad.js"
lib_dir="${nad_dir}/lib/node_modules"
nad_conf="${nad_dir}/etc/nad.conf"
log_dir=""

[[ -d $lib_dir ]] || {
    echo "Unable to find NAD modules directory ${lib_dir}"
    exit 1
}

[[ -x $node_bin ]] || {
    node_bin=$(command -v node)
    [[ -x $node_bin ]] || {
        echo "Unable to find node binary in path ${PATH}:${nad_dir}/bin"
        exit 1
    }
}

[[ -s $nad_script ]] || {
    echo "Unable to find NAD script ${nad_script}"
    exit 1
}

[[ -f /etc/logrotate.d/nad ]] && {
    log_dir="${nad_dir}/log"
    [[ -d $log_dir ]] || mkdir -p $log_dir
}

extra_opts=""
pid_file="/var/run/nad.pid"
daemon=0

while [[ $# -gt 0 ]]; do
	case $1 in
	--daemon)
		daemon=1
		;;
	--pid_file)
		pid_file="$2"
		shift
		;;
	*)
		extra_opts="${extra_opts} $1"
		;;
	esac
	shift
done

NAD_OPTS=""
[[ -s $nad_conf ]] && source $nad_conf #populate NAD_OPTS
cmd="${node_bin} ${nad_script} ${NAD_OPTS} ${extra_opts}"

export NODE_MODULES=$lib_dir #ensure node can find nad specific packages

if [[ $daemon -eq 1 ]]; then # start nad in background
    if [[ -n "$log_dir" ]]; then
        $cmd > ${log_dir}/nad.log 2>&1 &
    else
        $cmd &
    fi
    ret=$?
    echo $! > $pid_file
    exit $ret
fi

# run nad in foreground
$cmd

#END
