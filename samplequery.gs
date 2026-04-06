uses gw.api.database.Query
uses gw.api.database.QuerySelectColumns
uses gw.api.database.DBFunction
uses gw.api.path.Paths
uses gw.api.util.DateUtil

// ============================================================================
// Sample Query: PolicyPeriods by State and Date Range
//
// Retrieves all PolicyPeriod records for a given jurisdiction (state) where
// the period started within the last 6 months, ordered by PeriodStart date.
// ============================================================================

// 1. Create the query for the PolicyPeriod entity
var query = Query.make(PolicyPeriod)

// 2. Restrict to a specific state (jurisdiction)
query.compare(PolicyPeriod#BaseState, Equals, Jurisdiction.TC_CA)

// 3. Restrict to policy periods that started within the last 6 months
//    Uses DBFunction.DateFromTimestamp to extract the date portion from
//    the PeriodStart timestamp, then compares against a calculated date.
var sixMonthsAgo = DateUtil.addMonths(DateUtil.currentDate(), -6)
query.compare(
  DBFunction.DateFromTimestamp(query.getColumnRef("PeriodStart")),
  GreaterThanOrEquals,
  sixMonthsAgo
)

// 4. Execute the query and order results by PeriodStart
var results = query.select()
results.orderBy(QuerySelectColumns.path(Paths.make(PolicyPeriod#PeriodStart)))

// 5. Iterate and print results
for (period in results) {
  print("Policy: " + period.PolicyNumber
    + " | State: " + period.BaseState
    + " | Start: " + period.PeriodStart
    + " | End: " + period.PeriodEnd
    + " | Status: " + period.Status)
}
