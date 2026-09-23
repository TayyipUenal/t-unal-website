# DE DNS before the hosting migration

Authoritative nameservers: ns5.kasserver.com and ns6.kasserver.com.
Verified in KAS and with an authoritative DNS query before changing records.

| Name | Type | Original value | TTL |
| --- | --- | --- | --- |
| tayyipuenal.de | A | 185.158.133.1 | 7200 |
| www.tayyipuenal.de | A | 185.158.133.1 | 7200 |
| tayyipuenal.de | MX | 10 w0212c46.kasserver.com. | 7200 |

No apex AAAA record was returned. The KAS webserver is 85.13.148.238, and the existing document root is /www/htdocs/w0212c46/tayyipuenal.de/.

Only the two A records are in scope for the migration. MX, SPF, DKIM, DMARC, wildcard CNAME and ownership-verification TXT records remain unchanged.

Rollback: restore the two A records to 185.158.133.1. The prior website on that service has not been deleted.
