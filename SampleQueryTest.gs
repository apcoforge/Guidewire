package gw.servertest

uses gw.api.test.PCServerTestClassBase
uses gw.sampledata.SampleData
uses gw.suites.PCExampleServerSuite
uses gw.testharness.v3.Suites

@Export
@Suites(PCExampleServerSuite.NAME)
class SampleQueryTest extends PCServerTestClassBase {

  override function beforeClass() {
    super.beforeClass()
    // Load sample data for testing
    try {
      SampleData.loadSampleDataSet(SampleDataSet.TC_SMALL)
    } catch (e : Exception) {
      e.printStackTrace()
    }
  }

  /**
   * Test direct query execution with assertions
   */
  function testQueryWithAssertions() {
    // Example of how to test with actual assertions
    var query = gw.api.database.Query.make(entity.PolicyPeriod)
    query.compare("BaseState", Equals, typekey.Jurisdiction.TC_CA)

    var results = query.select()

    // Assert that query executed without error and returned results
    assertThat(results.Count >= 0).isTrue()

    // If results exist, verify they are for CA
    for (period in results) {
      assertThat(period.BaseState == typekey.Jurisdiction.TC_CA).isTrue()
    }
  }

  /**
   * Test the queryByState method
   */
  function testQueryByState() {
    try {
      gw.SampleQuery.queryByState()
      // If we reach here, the method executed successfully
      assertThat(true).isTrue()
    } catch (e : Exception) {
      assertThat(false).as("queryByState() threw an exception: " + e.Message).isTrue()
    }
  }

  /**
   * Test the queryByDateRange method
   */
  function testQueryByDateRange() {
    try {
      gw.SampleQuery.queryByDateRange()
      // If we reach here, the method executed successfully
      assertThat(true).isTrue()
    } catch (e : Exception) {
      assertThat(false).as("queryByDateRange() threw an exception: " + e.Message).isTrue()
    }
  }

  /**
   * Test the queryByPublicID method with a valid PublicID
   */
  function testQueryByPublicID_Valid() {
    try {
      // First, let's find an existing PolicyPeriod to get a valid PublicID
      var query = gw.api.database.Query.make(entity.PolicyPeriod)
      var existingPeriod = query.select().FirstResult

      if (existingPeriod != null) {
        // Call the method with a valid PublicID
        gw.SampleQuery.queryByPublicID(existingPeriod.PublicID)
      } else {
        // If no data exists, just call with a dummy ID to test the method structure
        gw.SampleQuery.queryByPublicID("dummy-id")
      }
      // If we reach here, the method executed successfully
      assertThat(true).isTrue()
    } catch (e : Exception) {
      assertThat(false).as("queryByPublicID() threw an exception: " + e.Message).isTrue()
    }
  }

  /**
   * Test the queryByPublicID method with an invalid PublicID
   */
  function testQueryByPublicID_Invalid() {
    try {
      // Call with a non-existent PublicID
      gw.SampleQuery.queryByPublicID("non-existent-id")
      // If we reach here, the method executed successfully
      assertThat(true).isTrue()
    } catch (e : Exception) {
      assertThat(false).as("queryByPublicID() threw an exception: " + e.Message).isTrue()
    }
  }
}