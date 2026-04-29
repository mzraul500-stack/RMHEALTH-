from setuptools import find_packages, setup
setup(
    name='rmhealth-trainer',
    version='0.1',
    packages=find_packages(),
    install_requires=[
        'scikit-learn==1.4.2',
        'pandas==2.2.2',
        'numpy==1.26.4',
        'google-cloud-storage==2.16.0',
    ]
)
