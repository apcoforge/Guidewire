package gw

uses gw.api.database.Query
uses gw.api.database.Relop
uses typekey.Jurisdiction

/**
 * Sample Query class for Guidewire PolicyCenter
 * Demonstrates querying PolicyPeriod entities using the Query API.
 */
class SampleQuery {

  /**
   * Query PolicyPeriods by state.
   */
  static function queryByState() {
    var query = Query.make(entity.PolicyPeriod)
    query.compare("BaseState", Equals, Jurisdiction.TC_CA)

    var results = query.select()
    print("Found " + results.Count + " policy periods for CA")
    for (period in results) {
      print("  - Period: " + period["PublicID"]
        + " | State: " + period["BaseState"]
        + " | Start: " + period["PeriodStart"])
    }
  }

  /**
   * Query PolicyPeriods by date range under CA.
   */
  static function queryByDateRange() {
    var query = Query.make(entity.PolicyPeriod)
    query.compare("BaseState", Equals, Jurisdiction.TC_CA)

    var sixMonthsAgo = gw.api.util.DateUtil.addMonths(gw.api.util.DateUtil.currentDate(), -6)
    query.compare("PeriodStart", Relop.GreaterThanOrEquals, sixMonthsAgo)

    var results = query.select()
    print("Found " + results.Count + " CA policy periods in the last 6 months")
    for (period in results) {
      print("  - Period: " + period["PublicID"]
        + " | Start: " + period["PeriodStart"]
        + " | End: " + period["PeriodEnd"])
    }
  }

  /**
   * Get a single PolicyPeriod by PublicID.
   */
  static function queryByPublicID(publicID: String) {
    var query = Query.make(entity.PolicyPeriod)
    query.compare("PublicID", Equals, publicID)

    var period = query.select().AtMostOneRow
    if (period != null) {
      print("Found period: " + period["PublicID"]
        + " | Start: " + period["PeriodStart"])
    } else {
      print("No policy period found with PublicID: " + publicID)
    }
  }
}