URL breakdown:

Searching with keyword:
https://bloomberg.avature.net/careers/SearchJobs/dd?listFilterMode=1&jobRecordsPerPage=12&

Searching with keyword and location:
https://bloomberg.avature.net/careers/SearchJobs/dd?1845=%5B162543%5D&1845_format=3996&listFilterMode=1&jobRecordsPerPage=12&

Search with evrything
https://bloomberg.avature.net/careers/SearchJobs/jj?1845=%5B162634%5D&1845_format=3996&1686=%5B55478%5D&1686_format=2312&2562=%5B219292%5D&2562_format=6594&listFilterMode=1&jobRecordsPerPage=12&jobOffset=

https://bloomberg.avature.net/careers/SearchJobs/
jj
?1845=%5B162634%5D&1845_format=3996 (?1845=[162634]&1845_format=3996)
&1686=%5B55478%5D&1686_format=2312
&2562=%5B219292%5D&2562_format=6594
&listFilterMode=1
&jobRecordsPerPage=12&

Job location search query param
?1845=[162501]&1845_format=3996 - dockland
?1845=[162634]&1845_format=3996 - austin texas
?1845=[162501,162634]&1845_format=3996 - both

Reverse engineering of the routes:
https://bloomberg.avature.net/careers/SearchJobs/{keyword}?{location}&listFilterMode={number}&jobRecordsPerPage={number}&jobOffset={number}
https://a2milkkf.avature.net/careers/JobDetail/{job_name}/{job_id}

- listFilterMode and jobRecordsPerPage on bloomberg, a2milkkf, uclahealth don't do anything
- we can increase offset by 6 until we go through all pages and collect all jobs, but we can also parse the body and look for "n-m of x results"

I first go with profiling and seeding:

- filtering unreachable hosts so I don't even bother with urls in the later stage
