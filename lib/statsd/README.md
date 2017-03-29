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
    flushInterval: 10000,
    groupKey: 'group.',
    hostKey: null,
    hostCategory: 'statsd',
    sendProcessStats: true    
}
```

* `servers` - is the same as the StatsD servers list.
* `flushInterval` - is the same as the StatsD flushInterval.
* `groupKey` - metrics prefixed with this key will be sent to the group check (if enabled).
* `hostKey` - metrics prefixed with this key will be sent to NAD to be reported as host metrics.
* `hostCategory` - the category to hold the host metrics e.g. with the default hostCategory of 'statsd', a metric named 'my_metric' would appear in Circonus as 'statsd\`my_metric'.

### `hostKey` and `groupKey`

| metric name                     | hostKey  | groupKey | disposition |
| ---                             | ---      | ---      | ---         |
| `[a-z0-9]+.*`                   | `null`   | `null`   | host |
| `host\.[a-z0-9]+.*`             | `host.`  | `null`   | host |
| `^[^host\.][a-z0-9]+.*`         | `host.`  | `null`   | group, if enabled, otherwise ignore |
| `group\.[a-z0-9]+.*`            | `null`   | `group.` | group, if enabled, otherwise ignore |
| `^[^group\.][a-z0-9]+.*`        | `null`   | `group.` | host |
| `host\.[a-z0-9]+.*`             | `host.`  | `group.` | host |
| `group\.[a-z0-9]+.*`            | `host.`  | `group.` | group, if enabled, otherwise ignore |
| `^[^(host|group)\.][a-z0-9]+.*` | `host.`  | `group.` | ignore |
