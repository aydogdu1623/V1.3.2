"""Compile the reference into a private-data-free OOXML template for the web exporter."""
from pathlib import Path
import sys, zipfile, json, openpyxl, warnings
warnings.filterwarnings("ignore", category=UserWarning)
from lxml import etree as E
ns='http://schemas.openxmlformats.org/spreadsheetml/2006/main'; N={'m':ns}; tag=lambda n:'{'+ns+'}'+n
src=Path(sys.argv[1]); out=Path(__file__).resolve().parents[1]/'assets/puantaj-template.bin'
expanded=openpyxl.load_workbook(src,data_only=False)
with zipfile.ZipFile(src) as z:
 strings=E.fromstring(z.read('xl/sharedStrings.xml')).findall('m:si',N)
 strings=[''.join(s.itertext()) for s in strings]
 parts={}
 for name in z.namelist():
  if name=='xl/calcChain.xml':continue
  data=z.read(name)
  if name.startswith('xl/worksheets/sheet') and name.endswith('.xml'):
   s=E.fromstring(data); idx=int(name.split('sheet')[-1].split('.')[0])
   for c in s.findall('.//m:sheetData/m:row/m:c',N):
    ref=c.get('r'); import re
    col=re.match('[A-Z]+',ref)[0]; row=int(re.search('[0-9]+',ref)[0])
    erase=idx==1 and 5<=row<=24 and col in ['C','D','E','F','G','H','I','K','L','N','O']
    erase=erase or (idx>=7 and 6<=row<=45 and (col=='AW' or (6<=sum((ord(a)-64)*26**i for i,a in enumerate(col[::-1]))<=36 and row%2==1)))
    f=c.find('m:f',N)
    if erase:
     for child in list(c):c.remove(child)
     c.attrib.pop('t',None)
    elif f is not None:
     if f.get('t')=='shared':
      formula=expanded.worksheets[idx-1][ref].value
      if not isinstance(formula,str) or not formula.startswith('='):raise ValueError(ref)
      f.text=formula[1:];f.attrib.clear()
     for child in list(c):
      if child.tag in [tag('v'),tag('is')]:c.remove(child)
     c.attrib.pop('t',None)
    elif c.get('t')=='s':
     v=c.find('m:v',N);value=strings[int(v.text)] if v is not None else ''
     for child in list(c):c.remove(child)
     c.set('t','inlineStr');E.SubElement(E.SubElement(c,tag('is')),tag('t')).text=value
   data=E.tostring(s,xml_declaration=True,encoding='UTF-8',standalone=True)
  elif name=='xl/sharedStrings.xml':
   data=('<?xml version="1.0"?><sst xmlns="'+ns+'" count="0" uniqueCount="0"/>').encode()
  elif name in ['[Content_Types].xml','xl/_rels/workbook.xml.rels']:
   s=E.fromstring(data)
   for child in list(s):
    if 'calcChain' in str(child.attrib):s.remove(child)
   data=E.tostring(s,xml_declaration=True,encoding='UTF-8')
  elif name.startswith('docProps/'):
   s=E.fromstring(data)
   for e in s.iter():
    if E.QName(e).localname in ['creator','lastModifiedBy']:e.text='CephePro'
   data=E.tostring(s,xml_declaration=True,encoding='UTF-8')
  parts[name]=data
 with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED) as dest:
  for k,v in parts.items():dest.writestr(k,v)
 print('Sanitized template:',out.stat().st_size,'bytes')
