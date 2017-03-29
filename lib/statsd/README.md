# NAD StatsD

## Metric types

NAD supports the core StatsD metric types (`c`, `g`, `s`, `ms`) as well as additional types specific to Circonus.

* `h` histogram, treated exactly the same as timing (`ms`) metrics.
* `t` text metrics.

Additionally, NAD StatsD does *not* automatically generate all of the derivative metrics from timings since they are represented as histograms in Circonus offering much more flexibility for analysis.

## Configuration

```js
{
    servers: [
        {
            server: 'udp',
            address: '127.0.0.1',
            port: 8125
        }
    ],
    flush_interval: 10000,
    group_check_id: null,
    group_key: null,
    host_key: null,
    host_category: 'statsd',
    send_process_stats: true    
}
```

* `servers` - array of objects - is the same as the StatsD servers list.
* `flush_interval` - milliseconds - is the same as the StatsD flushInterval.
* `group_check_id` - /^[0-9]+$/ - default is to retrieve it from COSI installation.
* `group_key` - string - metrics prefixed with this key will be sent to the group check (if enabled).
* `host_key` - string - metrics prefixed with this key will be sent to NAD to be reported as host metrics.
* `host_category` - string - the category to hold the host metrics e.g. with the default hostCategory of 'statsd', a metric named 'my_metric' would appear in Circonus as 'statsd\`my_metric'.
* `send_process_stats` - boolean - send statsd module's processing statistics.

### Group metrics

The StatsD module can bifurcate metrics - sending some to NAD (host) and some to a group check (intended to be used by multiple hosts - e.g. a group of web servers). COSI will create a group check if the `--statsd-group` parameter is provided when COSI registers the system. Additional systems which use the same parameter when COSI registers them will also send group metrics to the group check. This allows application metrics to go to either the host, the group, or both - providing more flexibility in viewing, aggregating and analytics. A group check can also be manually created as an HTTPTRAP check and setting  `group_check_id` in the StatsD configuration.

### `host_key` and `group_key`

The `host_key` and `group_key` are metric name prefixes which determine the disposition of a given metric.

| metric name | host_key  | group_key | disposition |
| ---         | ---      | ---      | ---         |
| *Default* ||||
| `foo`       | `null`   | `null`   | all metrics go to host |
| **Group** ||||
| `host.foo`  | `host.`  | `null`   | `foo` goes to host |
| `foo`       | `host.`  | `null`   | `foo` goes to group |
| **Host** ||||
| `group.foo` | `null`   | `group.` | `foo` goes to group |
| `foo`       | `null`   | `group.` | `foo` goes to host |
| **Explicit** ||||
| `host.foo`  | `host.`  | `group.` | `foo` goes to host |
| `group.foo` | `host.`  | `group.` | `foo` goes to group |
| `foo`       | `host.`  | `group.` | ignored |

> Note: If a group check is not enabled, all metrics destined for *group* will be ignored.
