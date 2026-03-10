How it should be tackled:

1. From Urls.txt file get all hosts and urls connected to them, it would be okay if certain stuff gets filtered like, endpoints that have /Login, or /Error, are not needed

Some of mandatory url paths:
/careers
/careers/JobDetail - for unique jobs
/careers/SearchJobs/ - for job filtering
...

- seeding and profiling is checking if host is reachable, and also then if urls are reachable, all this is doen in concurency as it is a huge file

Also no duplicates

2. After gathering all seeds for certain host, there should be profiling section, here the urls should tested if they are even reachable and if not they should be rejected and removed. Also some common patterns should be established here so that more urls can be tested after exiting ones are tested

- also logic for creating custom urls from which data can be fetched is implemented

So for example
This is url for certain filter search
https://bloomberg.avature.net/careers/SearchJobs/?1845=%5B162634%5D&1845_format=3996&listFilterMode=1&jobRecordsPerPage=12&

Here can be observed that listFilterMode can be changed, jobsRecordsPerPage can be changed, .... and so on on many urls there is different stuff. All of this should be kind of stored per host so that future url scraping can reference it and put values in that places. Also if all urls of the host are not reachable host becomes unreachable aswell

3. After profiling we should have clear urls which were not rejected and they returend something. Now all those urls should be executed and stuff should be extracted. From research urls return htmls as it is all ssr-d and I cannot send any api request to make it simpler.

For example urls that have careers only in or SearchJobs, they will probably return multiple results of jobs (also depends on filters), and from those results we can read html and extract JobDetail url for each record displayed.

This is also a discovery level where I create new urls with certain query params so that I can get to all jobs. In this case I retrieve amount of results per careers page together with current position and then I change offset which basically iterates through the pages. And on each page I gather job listing.

4. When gathered all JobDetails urls (or any similar) then all of those should be exectued to retrieve then job details for final data, also there can probably be urls with JobDetail already seeded from beggining and those urls should also be tested if they return anything, and now again fetched to see if they return relevant job details.

Data is retrieved from html as jobs have recognizable html structure which can be easily parsed.

5. Finally all that retrieved data should be stored to some file

Architecture:

- there is initial script which is used to gather more urls and potential endpoints from which we can fetch jobs
- after that those urls are stored in certain file and then read as it is currently with urls.txt file provided
- those urls get read and go through process described above where cleanup and filtering happenes, with ending of extracting job listings into json file

What to upgrade:

- maybe some kind of checkpointing system on longer runs
- better logging
- filtering urls which are used (clearing of whole Urls file)
