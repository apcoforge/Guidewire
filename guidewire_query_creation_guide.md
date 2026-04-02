# Guidewire PolicyCenter: Creating Queries — Comprehensive Reference

## Source Documents Analyzed

This guide consolidates findings from the following Guidewire PolicyCenter 10.0.0 documentation:

- **Gosu Reference Guide** — Chapter 23: Query Builder APIs (primary source)
- **Configuration Guide** — Entity definitions, view entities, indexes, and data model
- **Integration Guide** — Web services and plugin queries
- **Application Guide** — PolicyCenter features and business context
- **InsuranceSuite Guide** — Cross-application integration patterns

---

## 1. Overview of the Query Builder API

Guidewire PolicyCenter uses the **Query Builder API** (`gw.api.database.Query`) to retrieve information from the application database. This API models SQL SELECT functionality through object-oriented Gosu code.

### Key Classes and Imports

```gosu
uses gw.api.database.Query
uses gw.api.database.QuerySelectColumns
uses gw.api.database.DBFunction
uses gw.api.database.InOperation
uses gw.api.database.Relop
uses gw.api.path.Paths
uses gw.api.util.DateUtil
```

### Processing Cycle of a Query

1. **Create** a query object: `Query.make(EntityType)`
2. **Restrict** the query with predicates (`.compare()`, `.between()`, etc.)
3. **Execute** with `.select()` to produce a select object
4. **Order** results with `.orderBy()`
5. **Iterate** results with a `for` loop or `.iterator()`

> **Important:** The database query is NOT executed when `.select()` is called. It is deferred until you actually access the result set (e.g., iterate, count, or get first result).

---

## 2. Building a Simple Query

### Select All Entities

**SQL Equivalent:**
```sql
SELECT * FROM addresses;
```

**Gosu:**
```gosu
uses gw.api.database.Query

var query = Query.make(Address)
var select = query.select()
var result = select.iterator()
```

### Restrict with WHERE Clause

**SQL Equivalent:**
```sql
SELECT * FROM addresses WHERE city = 'Chicago';
```

**Gosu:**
```gosu
uses gw.api.database.Query

var query = Query.make(Address)
query.compare(Address#City, Equals, "Chicago")
var result = query.select()
```

### Order Results

**SQL Equivalent:**
```sql
SELECT * FROM addresses WHERE city = 'Chicago' ORDER BY postal_code;
```

**Gosu:**
```gosu
uses gw.api.database.Query
uses gw.api.database.QuerySelectColumns
uses gw.api.path.Paths

var query = Query.make(Address)
query.compare(Address#City, Equals, "Chicago")
var select = query.select()
select.orderBy(QuerySelectColumns.path(Paths.make(Address#PostalCode)))
```

### Iterate and Access Results

```gosu
uses gw.api.database.Query
uses gw.api.database.QuerySelectColumns
uses gw.api.path.Paths

var query = Query.make(Address)
query.compare(Address#City, Equals, "Chicago")
var select = query.select()
select.orderBy(QuerySelectColumns.path(Paths.make(Address#PostalCode)))

for (address in select) {
  print(address.AddressLine1 + ", " + address.City + ", " + address.PostalCode)
}
```

---

## 3. Restricting Queries with Predicates

### Comparison Operators (Relop)

| Operator | Description |
|----------|-------------|
| `Equals` | Exact match |
| `NotEquals` | Not equal |
| `LessThan` | Less than |
| `LessThanOrEquals` | Less than or equal |
| `GreaterThan` | Greater than |
| `GreaterThanOrEquals` | Greater than or equal |

### Case-Sensitive Comparison

```gosu
var query = Query.make(Company)
query.compare(Company#Name, Equals, "Acme Rentals")
```

### Case-Insensitive Comparison

```gosu
var query = Query.make(Company)
query.compareIgnoreCase(Company#Name, Equals, "Acme Rentals")
```

> **Note:** The entity field must have `supportsLinguisticSearch = true` in its data model definition for optimal performance.

### Range Comparison (BETWEEN)

```gosu
var query = Query.make(Company)
query.between(Company#Name, "Bank", "Business")
```

### Partial Match — Starts With

```gosu
var query = Query.make(Company)
query.startsWith(Company#Name, "Acme", false) // false = case-sensitive
```

### Partial Match — Contains (Anywhere)

```gosu
var queryActivity = Query.make(Activity)
queryActivity.join(Activity#AssignedUser).compare(User#PublicID, Equals, "pc:105")
queryActivity.contains(Activity#Subject, "Review", true) // true = case-insensitive
```

> **Warning:** Using `contains` as the most restrictive predicate causes a full table scan. Always combine with more restrictive predicates.

### Null Value Comparisons

```gosu
// Select where birthday is unknown
var query = Query.make(Person)
query.compare(Person#DateOfBirth, Equals, null)

// Select where address line is known
var query2 = Query.make(Address)
query2.compare(Address#AddressLine1, NotEquals, null)
```

### Set Inclusion — compareIn

```gosu
var lastNames = {"Smith", "Applegate"}
var query = Query.make(Person)
query.compareIn(Person#LastName, lastNames)
```

---

## 4. Date and Time Functions

### DateDiff — Interval Between Dates

```gosu
uses gw.api.database.DBFunction

var query = Query.make(Activity)
query.compare(
  DBFunction.DateDiff(DAYS, query.getColumnRef("AssignmentDate"), query.getColumnRef("EndDate")),
  LessThan,
  15
)
```

### DatePart — Extract Part of a Date

```gosu
var query = Query.make(Activity)
query.compare(
  DBFunction.DatePart(DAY_OF_MONTH, query.getColumnRef("endDate")),
  Equals,
  15
)
```

Available date parts: `HOUR`, `MINUTE`, `SECOND`, `DAY_OF_WEEK`, `DAY_OF_MONTH`, `MONTH`, `YEAR`

### DateFromTimestamp — Extract Date Only

```gosu
var query = Query.make(Address)
query.compare(
  DBFunction.DateFromTimestamp(query.getColumnRef("CreateTime")),
  Equals,
  DateUtil.currentDate()
)
```

### Date Range Query

```gosu
var firstDayOfCurrentMonth = DateUtil.currentDate().FirstDayOfMonth
var previousMonthStart = DateUtil.addMonths(firstDayOfCurrentMonth, -1)
var previousMonthEnd = DateUtil.addDays(firstDayOfCurrentMonth, -1)

var query = Query.make(Address)
query.between(
  DBFunction.DateFromTimestamp(query.getColumnRef("CreateTime")),
  previousMonthStart,
  previousMonthEnd
)
```

---

## 5. Boolean Logic — AND / OR Groupings

### Default: Implicit AND

Multiple predicates on a query are combined with AND by default:

```gosu
var query = Query.make(Person)
query.compare(Person#LastName, Equals, "Newton")
query.compare(Person#FirstName, Equals, "Ray")
// Equivalent to: WHERE LastName = 'Newton' AND FirstName = 'Ray'
```

### OR Grouping

```gosu
var query = Query.make(Person)
query.or(\ or1 -> {
  or1.compare(Person#LastName, Equals, "Newton")
  or1.compare(Person#FirstName, Equals, "Ray")
})
// Equivalent to: WHERE (LastName = 'Newton' OR FirstName = 'Ray')
```

### Combining AND and OR

```gosu
// (CreateTime < 10 days ago) OR ((LastName = "Newton") AND (FirstName = "Ray"))
query.or(\ or1 -> {
  or1.compare(Person#CreateTime, LessThanOrEquals,
    DateUtil.addBusinessDays(DateUtil.currentDate(), -10))
  or1.and(\ and1 -> {
    and1.compare(Person#LastName, Equals, "Newton")
    and1.compare(Person#FirstName, Equals, "Ray")
  })
})
```

### Complex Combined Example (PolicyPeriod)

```gosu
// ((WrittenDate < Today-90) OR CancellationDate IS NOT NULL)
// AND ((BaseState = "FR") OR Locked)
query.or(\ or1 -> {
  or1.compare(DBFunction.DateFromTimestamp(or1.getColumnRef("WrittenDate")),
    LessThan, DateUtil.addDays(DateUtil.currentDate(), -90))
  or1.compare(PolicyPeriod#CancellationDate, NotEquals, null)
})
query.or(\ or2 -> {
  or2.compare(PolicyPeriod#BaseState, Equals, Jurisdiction.TC_FR)
  or2.compare(PolicyPeriod#Locked, Equals, true)
})
```

---

## 6. Joins

### Inner Join (Foreign Key on Primary Entity)

```gosu
var queryCompany = Query.make(Company)
var tableAddress = queryCompany.join(Company#PrimaryAddress)
tableAddress.compare(Address#City, Equals, "Chicago")

for (company in queryCompany.select()) {
  print(company.Name + ", " + company.PrimaryAddress.City)
}
```

**Chained syntax:**
```gosu
queryCompany.join(Company#PrimaryAddress).compare(Address#City, Equals, "Chicago")
```

### Left Outer Join

```gosu
var queryGroup = Query.make(Group)
var userTable = queryGroup.outerJoin(Group#Supervisor)
var contactTable = userTable.outerJoin(User#Contact)
contactTable.compare(UserContact#LastName, Relop.Equals, "Visor")
```

### Join with Subtype Restriction (cast)

```gosu
// Find policies that have been renewed
var queryPolicy = Query.make(Policy).withDistinct(true)
queryPolicy.join(Job#Policy).cast(Renewal)  // Only Renewal jobs
```

### Combining Predicates on Primary AND Joined Entities

```gosu
var queryCompany = Query.make(Company).compare(Company#Name, Equals, "Stewart Media")
queryCompany.join(Company#PrimaryAddress).compare(Address#City, Equals, "Chicago")
```

### OR Across Primary and Joined Entities

```gosu
var queryCompany = Query.make(Company)
var tableAddress = queryCompany.join(Company#PrimaryAddress)
tableAddress.or(\ or1 -> {
  or1.compare(Address#City, Equals, "Chicago")
  or1.compare(queryCompany.getColumnRef("Name"), Equals, "Armstrong Cleaners")
})
```

---

## 7. Subselects (Subqueries)

### IN Subselect

**SQL Equivalent:**
```sql
SELECT ID FROM pc_user
WHERE ID IN (SELECT AuthorID FROM pc_note WHERE Topic IN (1, 10006));
```

**Gosu:**
```gosu
var outerQuery = Query.make(User)
var innerQuery = Query.make(Note)
innerQuery.compareIn(Note#Topic, {NoteTopicType.TC_GENERAL, NoteTopicType.TC_LEGAL})
outerQuery.subselect(User#ID, InOperation.CompareIn, innerQuery, Note#Author)

for (user in outerQuery.select()) {
  print(user.DisplayName)
}
```

### NOT IN Subselect

Use `InOperation.CompareNotIn` instead of `CompareIn`:

```gosu
outerQuery.subselect(User#ID, InOperation.CompareNotIn, innerQuery, Note#Author)
```

---

## 8. Row Queries (Column Selection & Aggregates)

Row queries return specific columns instead of full entity instances.

### Basic Row Query

```gosu
var query = Query.make(Person)
var results = query.select({
  QuerySelectColumns.path(Paths.make(Person#Subtype)),
  QuerySelectColumns.pathWithAlias("FName", Paths.make(Person#FirstName)),
  QuerySelectColumns.pathWithAlias("LName", Paths.make(Person#LastName))
})

for (row in results) {
  print(row.getColumn("Person.Subtype") + ": " + row.getColumn("FName") + " " + row.getColumn(2))
}
```

### Aggregate Functions

Available aggregate functions: `Sum`, `Max`, `Min`, `Avg`, `Count`

**SQL Equivalent:**
```sql
SELECT Country, MAX(CreateTime) FROM pc_Address GROUP BY Country;
```

**Gosu:**
```gosu
var query = Query.make(Address)
var latestAddress = QuerySelectColumns.dbFunctionWithAlias("LatestAddress",
  DBFunction.Max(Paths.make(Address#CreateTime)))
var rowResults = query.select({
  QuerySelectColumns.pathWithAlias("Country", Paths.make(Address#Country)),
  latestAddress
})
```

> **Note:** The `GROUP BY` clause is automatically added for non-aggregate columns.

---

## 9. Additional Query Features

### Distinct Results

```gosu
var query = Query.make(Policy).withDistinct(true)
```

### Union of Two Queries

```gosu
var union = query1.union(query2)
```

### First Result Only

```gosu
var firstItem = query.select().FirstResult
```

### Limit Result Count

```gosu
var result = query.select()
result.getCountLimitedBy(100)
result.setPageSize(50)
```

### Get Single Row (At Most One)

```gosu
var singleResult = query.select().AtMostOneRow
```

### View SQL for Debugging

```gosu
var query = Query.make(Contact).withLogSQL(true)
```

### Include Retired Entities

By default, retired entities are excluded. To include them:
```gosu
query.withFindRetired(true)
```

---

## 10. View Entities for Performance

View entities restrict the data returned by queries without requiring a separate database table. They improve performance on frequently used list pages.

From the Configuration Guide: a view entity is defined with a `primaryEntity` attribute and restricts columns returned. Queries against a view entity run against the normal entity table but only load the specified subset of fields.

**Use view entities when:**
- Building list views that only need a few columns
- Frequently queried pages with large entity tables
- You want to avoid loading full entity object graphs

---

## 11. Best Practices (from Guidewire Documentation)

1. **Use feature literals** (e.g., `Entity#Property`) instead of string-based property references in queries
2. **Avoid `contains()` as the most restrictive predicate** — it causes full table scans
3. **Test `startsWith()` in realistic environments** — can be slow as the most restrictive predicate
4. **Use `compareIn()` instead of multiple OR comparisons** on a single field
5. **Consider subselects over joins** for foreign-key-on-right patterns — the query optimizer often performs better
6. **Use view entities** for list views to avoid loading full entity graphs
7. **Add indexes** to entity definitions for fields frequently used in query restrictions
8. **Do not reference virtual properties** in entity name definitions or queries — use database-backed fields only
9. **BillingCenter must start before PolicyCenter** when integrated, as PolicyCenter sends entity instances on startup

---

## 12. PolicyCenter-Specific Query Patterns

### Query for a Policy by Number

```gosu
var query = Query.make(Policy)
query.compare(Policy#PolicyNumber, Equals, "PA-001234")
var policy = query.select().AtMostOneRow
```

### Query for Activities by Assigned User

```gosu
var query = Query.make(Activity)
query.join(Activity#AssignedUser).compare(User#PublicID, Equals, "pc:105")
for (activity in query.select()) {
  print(activity.Subject)
}
```

### Query for Users by Username

```gosu
var users = Query.make(User)
  .join(User#Credential)
  .compare(Credential#UserName, Equals, "aapplegate")
  .select()
```

### Query PolicyPeriods by State and Date

```gosu
var query = Query.make(PolicyPeriod)
query.compare(PolicyPeriod#BaseState, Equals, Jurisdiction.TC_CA)
query.compare(
  DBFunction.DateFromTimestamp(query.getColumnRef("PeriodStart")),
  GreaterThanOrEquals,
  DateUtil.addMonths(DateUtil.currentDate(), -6)
)
```

---

## Summary of SQL-to-Gosu Mapping

| SQL | Gosu Query Builder |
|-----|-------------------|
| `SELECT * FROM table` | `Query.make(EntityType)` |
| `WHERE col = val` | `.compare(Entity#Col, Equals, val)` |
| `WHERE col LIKE 'val%'` | `.startsWith(Entity#Col, "val", false)` |
| `WHERE col LIKE '%val%'` | `.contains(Entity#Col, "val", false)` |
| `WHERE col BETWEEN a AND b` | `.between(Entity#Col, a, b)` |
| `WHERE col IN (a, b, c)` | `.compareIn(Entity#Col, {a, b, c})` |
| `WHERE col IS NULL` | `.compare(Entity#Col, Equals, null)` |
| `JOIN t ON ...` | `.join(Entity#ForeignKey)` |
| `LEFT OUTER JOIN` | `.outerJoin(Entity#ForeignKey)` |
| `ORDER BY col` | `.select().orderBy(QuerySelectColumns.path(...))` |
| `GROUP BY col` | Implied by aggregate column selections |
| `HAVING` | `.having()` |
| `DISTINCT` | `.withDistinct(true)` |
| `UNION` | `query1.union(query2)` |
| `IN (SELECT ...)` | `.subselect(..., InOperation.CompareIn, ...)` |
| `MAX(col)` | `DBFunction.Max(Paths.make(Entity#Col))` |
| `COUNT(*)` | `DBFunction.Count(Paths.make(Entity#Col))` |
