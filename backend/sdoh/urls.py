from django.urls import path
from .views import (
    PatientPredictView,
    PatientListView,
    PatientDetailView,
    BatchPredictAllView,
    ModelInfoView,
    CountyRiskMapView,
    CountyDetailRiskView,
    OverviewView,
    InterventionsView,
    CurrentPatientPredictView,
    CurrentCommunityDetailView,
    BatchCurrentPredictView,
    CurrentPatientListView,
    CurrentPatientUploadView,
    CommunityCountyListView,
    CommunityCountyDetailView,
    CommunityCountyDriversView,
    CommunityCountyInterventionsView,
    CommunityInterventionGenerateView,
    CommunityNotificationSendView,
    CommunityNotificationSimulateView,
    CommunityNotificationListView,
    CommunityNotificationStatusUpdateView,
    CommunityDomainListView,
    CommunityCountyContactsView,
    CommunityNotificationGenerateAIEmailView,
    StaffListView,
    StaffDetailView,
)

urlpatterns = [
    path('overview/', OverviewView.as_view(), name='overview-dashboard'),
    path('interventions/', InterventionsView.as_view(), name='interventions-list'),
    path('members/', PatientListView.as_view(), name='members-list'),
    path('patients/', PatientListView.as_view(), name='patient-list'),
    path('map/counties/', CountyRiskMapView.as_view(), name='map-counties'),
    path('map/counties/<str:county_id>/', CountyDetailRiskView.as_view(), name='map-county-detail'),
    path('geographic-risk/county/<str:county_id>/', CountyDetailRiskView.as_view(), name='geographic-risk-county'),
    path('patients/predict-all/', BatchPredictAllView.as_view(), name='batch-predict-all'),
    path('patients/<str:patient_id>/', PatientDetailView.as_view(), name='patient-detail'),
    path('patients/<str:patient_id>/predict/', PatientPredictView.as_view(), name='patient-predict'),
    path('model-info/', ModelInfoView.as_view(), name='model-info'),
    path('current-patients/', CurrentPatientListView.as_view(), name='current-patient-list'),
    path('current-patients/predict-all/', BatchCurrentPredictView.as_view(), name='batch-current-predict-all'),
    path('current-patients/upload/', CurrentPatientUploadView.as_view(), name='current-patient-upload'),
    path('current-patients/<str:patient_id>/predict/', CurrentPatientPredictView.as_view(), name='current-patient-predict'),
    path('current-communities/<str:tract_fips>/', CurrentCommunityDetailView.as_view(), name='current-community-detail'),
    
    # Community Intervention APIs
    path('community/counties/', CommunityCountyListView.as_view(), name='community-county-list'),
    path('community/counties/<str:county_fips>/', CommunityCountyDetailView.as_view(), name='community-county-detail'),
    path('community/counties/<str:county_fips>/drivers/', CommunityCountyDriversView.as_view(), name='community-county-drivers'),
    path('community/counties/<str:county_fips>/interventions/', CommunityCountyInterventionsView.as_view(), name='community-county-interventions'),
    path('community/interventions/generate/', CommunityInterventionGenerateView.as_view(), name='community-intervention-generate'),
    path('community/notifications/<str:notification_id>/send/', CommunityNotificationSendView.as_view(), name='community-notification-send'),
    path('community/notifications/<str:notification_id>/simulate/', CommunityNotificationSimulateView.as_view(), name='community-notification-simulate'),
    path('community/notifications/<str:notification_id>/status/', CommunityNotificationStatusUpdateView.as_view(), name='community-notification-status-update'),
    path('community/notifications/<str:notification_id>/generate-ai-email/', CommunityNotificationGenerateAIEmailView.as_view(), name='community-notification-generate-ai-email'),
    path('community/notifications/', CommunityNotificationListView.as_view(), name='community-notification-list'),
    path('community/domains/', CommunityDomainListView.as_view(), name='community-domain-list'),
    path('community/contacts/<str:county_fips>/', CommunityCountyContactsView.as_view(), name='community-county-contacts'),
    
    # Staff Management APIs
    path('staff/', StaffListView.as_view(), name='staff-list'),
    path('staff/<str:firebase_uid>/', StaffDetailView.as_view(), name='staff-detail'),
]




