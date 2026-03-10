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
- I need to make parallel readings of the urls file because it is to slow to sequential, basically seeding and profiling is data cleanup needed to be done before anything more advanced gets executed on those urls as I need to retrieve data for jobs

// Body of job detail

<script type="application/ld+json">{"@context":"https:\/\/schema.org\/","@type":"JobPosting","title":"Senior Software Engineer 21838","description":"Provides significant contributions in the design, coding, testing, support and debugging of new software or enhancements to existing software.\n\n\tThis role reports to the office on hybrid bases, three times a week in 601 S. Tryon Street, Charlotte, NC","hiringOrganization":{"@type":"Organization","name":"Ally Financial"},"datePosted":"2026-03-09","jobLocation":{"@type":"Place","address":{"@type":"PostalAddress","addressLocality":"Charlotte, NC"}}}</script>

```html
<article
  class="article article--details regular-fields--cols-2Z js_collapsible"
  aria-expanded="false"
>
  <div class="article__header js_collapsible__header">
    <div class="article__header__text">
      <h3 class="article__header__text__title article__header__text__title--6">
        <i
          class="article__header__text__title__icon fv fv-address-book-o fa-fw"
          aria-hidden="true"
        ></i>

        General information
      </h3>
    </div>
  </div>

  <div class="article__content js_collapsible__content">
    <div class="article__content__view">
      <div class="article__content__view__field">
        <div class="article__content__view__field__label">Job Title</div>

        <div class="article__content__view__field__value">
          Production Operator
        </div>
      </div>
      <div class="article__content__view__field">
        <div class="article__content__view__field__label">Location</div>

        <div class="article__content__view__field__value">
          Australia - New South Wales
        </div>
      </div>
      <div class="article__content__view__field">
        <div class="article__content__view__field__label">Date Published</div>

        <div class="article__content__view__field__value">
          Thursday, March 5, 2026
        </div>
      </div>
      <div class="article__content__view__field">
        <div class="article__content__view__field__label">Ref #</div>

        <div class="article__content__view__field__value">376</div>
      </div>
      <div class="article__content__view__field">
        <div class="article__content__view__field__label">Work Type</div>

        <div class="article__content__view__field__value">Permanent</div>
      </div>
      <div class="article__content__view__field">
        <div class="article__content__view__field__label">Business Unit</div>

        <div class="article__content__view__field__value">Production</div>
      </div>
    </div>
  </div>
</article>
```
