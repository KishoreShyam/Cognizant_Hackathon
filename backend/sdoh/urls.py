from django.urls import path
from .views import (
    PatientPredictView,
    PatientListView,
    PatientDetailView,
    BatchPredictAllView,
    ModelInfoView,
    CountyRiskMapView,
    OverviewView,
    InterventionsView,
)

urlpatterns = [
    path('overview/', OverviewView.as_view(), name='overview-dashboard'),
    path('interventions/', InterventionsView.as_view(), name='interventions-list'),
    path('members/', PatientListView.as_view(), name='members-list'),
    path('patients/', PatientListView.as_view(), name='patient-list'),
    path('map/counties/', CountyRiskMapView.as_view(), name='map-counties'),
    path('patients/predict-all/', BatchPredictAllView.as_view(), name='batch-predict-all'),
    path('patients/<str:patient_id>/', PatientDetailView.as_view(), name='patient-detail'),
    path('patients/<str:patient_id>/predict/', PatientPredictView.as_view(), name='patient-predict'),
    path('model-info/', ModelInfoView.as_view(), name='model-info'),
]

